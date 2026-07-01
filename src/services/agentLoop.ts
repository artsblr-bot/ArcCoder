import { useArc } from '../store/arc'
import { routeModel } from './router'
import { streamArcTurn, chatArc, userMessageFor, isAbort, type ToolMsg } from './arcChat'
import { buildSystemPrompt } from '../config/prompts'
import { effortConfig, type EffortConfig } from './effort'
import { scrubIdentity } from './sanitize'
import { TOOL_DEFS, executeTool, parseArgs, titleFor, arcyFor, showsCard } from './tools'
import { scheduleSave } from './persistence'
import { cancelQuestion } from './askUser'
import { readFile, killActiveProcesses } from './webcontainer'
import type { ArcModelId } from '../config/providers'

/** Extract a (possibly unterminated) JSON string value from streaming tool args. */
function partialField(args: string, key: string): string | null {
  const m = args.match(new RegExp('"' + key + '"\\s*:\\s*"'))
  if (!m || m.index === undefined) return null
  let out = ''
  let esc = false
  for (let i = m.index + m[0].length; i < args.length; i++) {
    const c = args[i]
    if (esc) {
      out += c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c
      esc = false
    } else if (c === '\\') esc = true
    else if (c === '"') break
    else out += c
  }
  return out
}

// Type a file into the editor over ~1s so every write feels hand-written, even when
// the provider delivers the tool arguments in one chunk (no incremental streaming).
async function revealFile(path: string, content: string, signal: AbortSignal): Promise<void> {
  const set = useArc.getState().setStreamFile
  const total = content.length
  if (total <= 60) {
    set(path, content)
    return
  }
  const chunk = Math.ceil(total / 36)
  for (let i = chunk; i < total; i += chunk) {
    if (signal.aborted) break
    set(path, content.slice(0, i))
    await new Promise((r) => setTimeout(r, 26))
  }
  set(path, content)
}

const MAX_ITERS = 26
let controller: AbortController | null = null

// The full model thread (system + every user/assistant/tool message), kept across
// turns so context — including prior tool calls and their results — is preserved.
let conversation: ToolMsg[] | null = null

/** Reset the thread (new project / resumed project). */
export function resetConversation(): void {
  conversation = null
}

// Ensure every assistant tool_call has a matching tool response (an interrupted turn
// can leave dangling calls, which the API rejects and breaks the next turn's tools).
function repairConversation(): void {
  if (!conversation) return
  for (let i = 0; i < conversation.length; i++) {
    const m = conversation[i]
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const missing = new Set(m.tool_calls.map((t) => t.id))
      for (let j = i + 1; j < conversation.length && conversation[j].role === 'tool'; j++) {
        missing.delete(conversation[j].tool_call_id ?? '')
      }
      let at = i + 1
      for (const id of missing) {
        conversation.splice(at++, 0, { role: 'tool', tool_call_id: id, name: 'tool', content: '(interrupted)' })
      }
    }
  }
}

function trimConversation(): void {
  if (!conversation) return
  const sys = conversation[0]
  let rest = conversation.slice(1)
  if (rest.length > 44) rest = rest.slice(rest.length - 44)
  // Never start with an orphaned tool result (would break the API pairing).
  while (rest.length && rest[0].role === 'tool') rest.shift()
  conversation = [sys, ...rest]
}

export function stopTurn(): void {
  controller?.abort()
  killActiveProcesses()
  cancelQuestion()
}
export function isRunning(): boolean {
  const s = useArc.getState().status
  return s === 'thinking' || s === 'working'
}

function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4)
}

/** Name the session from the first prompt, using Arc3Mini (fast, fire-and-forget). */
async function maybeNameSession(userText: string): Promise<void> {
  if (useArc.getState().projectName !== 'untitled') return
  // Stagger so this doesn't compete with the main turn for the free-tier rate limit.
  await new Promise((r) => setTimeout(r, 2500))
  if (useArc.getState().projectName !== 'untitled') return
  try {
    const raw = await chatArc(
      'arc3mini',
      [
        { role: 'system', content: 'You name coding projects. Reply with ONLY a 2–4 word Title Case name. No quotes, no punctuation, no explanation.' },
        { role: 'user', content: `Name a project for this request:\n${userText.slice(0, 240)}` },
      ],
      { maxTokens: 24, reasoning: false, temperature: 0.4 },
    )
    const clean = raw
      .replace(/["'`.\n]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 5)
      .join(' ')
      .slice(0, 40)
    if (clean && useArc.getState().projectName === 'untitled') {
      useArc.getState().setProjectName(clean)
      scheduleSave(800)
    }
  } catch {
    /* keep "untitled" */
  }
}

function buildHistory(): ToolMsg[] {
  const msgs: ToolMsg[] = []
  for (const t of useArc.getState().timeline) {
    if (t.kind === 'user') msgs.push({ role: 'user', content: t.text })
    else if (t.kind === 'assistant' && t.text.trim()) msgs.push({ role: 'assistant', content: t.text })
  }
  return msgs.slice(-16)
}

/** Run stream→tool iterations on `messages` until the model stops calling tools. */
async function agentSteps(messages: ToolMsg[], model: ArcModelId, eff: EffortConfig, signal: AbortSignal): Promise<void> {
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    const reasoningId = useArc.getState().pushTimeline({ kind: 'reasoning', text: '' })
    const assistantId = useArc.getState().pushTimeline({ kind: 'assistant', text: '' })
    // Accumulate raw deltas and render the scrubbed buffer, so a hidden-provider name
    // is never visible even for a frame while streaming.
    let rawReason = ''
    let rawText = ''

    const argBuf = new Map<number, { name: string; args: string }>()
    const res = await streamArcTurn(
      model,
      messages,
      useArc.getState().mode === 'ask' ? [] : TOOL_DEFS,
      {
        onReasoning: (d) => {
          rawReason += d
          useArc.getState().updateTimeline(reasoningId, { text: scrubIdentity(rawReason) })
        },
        onText: (d) => {
          rawText += d
          useArc.getState().updateTimeline(assistantId, { text: scrubIdentity(rawText) })
        },
        // Stream a file into the editor live as Arc "types" its write_file content.
        onToolDelta: (index, name, frag) => {
          const e = argBuf.get(index) ?? { name: '', args: '' }
          if (name) e.name = name
          e.args += frag
          argBuf.set(index, e)
          if (e.name === 'write_file') {
            const path = partialField(e.args, 'path')
            if (path) useArc.getState().setStreamFile('/' + path.replace(/^\/+/, ''), partialField(e.args, 'content') ?? '')
          }
        },
      },
      { reasoning: eff.reasoning, maxTokens: eff.maxTokens, signal },
    )

    const st = useArc.getState()
    st.updateTimeline(reasoningId, { text: scrubIdentity(res.reasoning), done: true })
    st.updateTimeline(assistantId, { text: scrubIdentity(res.text) })
    st.addContext(estimateTokens(res.text) + estimateTokens(res.reasoning))

    if (res.toolCalls.length === 0) {
      // In Build mode the only way to finish is the `complete` tool — nudge until then.
      if (useArc.getState().mode === 'build' && iter < MAX_ITERS - 1) {
        messages.push({
          role: 'user',
          content:
            "You stopped without finishing. Keep going — use your tools to actually do the work now. Only when the ENTIRE task is built and verified, call the `complete` tool. Do not reply with prose alone.",
        })
        continue
      }
      return
    }

    messages.push({ role: 'assistant', content: res.text || null, tool_calls: res.toolCalls })
    st.setStatus('working')
    const isComplete = res.toolCalls.some((tc) => tc.function.name === 'complete')

    for (const tc of res.toolCalls) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      const name = tc.function.name
      const args = parseArgs(tc.function.arguments)
      const a = arcyFor(name)
      useArc.getState().setArcy(a.activity, a.target)
      let cardId: string | undefined
      if (showsCard(name)) cardId = useArc.getState().pushTimeline({ kind: 'action', tool: name, title: titleFor(name, args), status: 'running' })
      // Word-by-word reveal of the file, unless the live stream already typed it out.
      if (name === 'write_file' && typeof args.content === 'string') {
        const np = '/' + String(args.path ?? '').replace(/^\/+/, '')
        const cur = useArc.getState().streamFile
        if (np !== '/' && (!cur || cur.path !== np || cur.content.length < args.content.length)) {
          await revealFile(np, args.content, signal)
        }
      }
      const out = await executeTool(name, args)
      if (cardId) useArc.getState().updateTimeline(cardId, { status: out.ok ? 'done' : 'error', detail: out.detail })
      messages.push({ role: 'tool', tool_call_id: tc.id, name, content: out.result.slice(0, 6000) })
    }
    useArc.getState().clearStreamFile()
    if (isComplete) return
  }
}

const SUPERCODE_STAGES = [
  'SUPERCODE · stage 1 — SPEC: Write a short, concrete spec with explicit, checkable acceptance criteria for this task. Call present_plan to show it.',
  'SUPERCODE · stage 2 — BUILD: Implement the solution to that spec. Create every file you need and run what you need to.',
  'SUPERCODE · stage 3 — VERIFY: Run and test it. Fix every problem until it genuinely works and satisfies each acceptance criterion.',
  'SUPERCODE · stage 4 — CRITIC: Final hardening pass — edge cases, accessibility, performance, and polish. Fix what you find, then give a short summary of what you built.',
]

export async function runTurn(userText: string, images: string[] = []): Promise<void> {
  const store = useArc.getState()
  if (isRunning() || !userText.trim()) return

  const route = routeModel({ text: userText, hasImage: images.length > 0, effort: store.effort, override: store.override, prev: store.model })
  if (route.model !== store.model) store.setModel(route.model)
  if (route.announce) {
    store.setToast(route.announce)
    store.pushTimeline({ kind: 'switch', text: route.announce, to: route.model })
  }

  const eff = effortConfig(store.effort)
  store.setStatus('thinking')
  store.setArcy(eff.supercode ? 'overdrive' : 'thinking', 'agent')
  if (eff.supercode) store.setBoost(true)
  void maybeNameSession(userText)

  const projectRules = await readFile('/Arc.md').catch(() => readFile('/ARC.md').catch(() => ''))
  const sys = buildSystemPrompt({ model: route.model, mode: store.mode, effort: store.effort, projectRules })
  const userContent: ToolMsg['content'] = images.length
    ? [{ type: 'text', text: userText }, ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } }))]
    : userText

  // Persistent thread: seed from prior timeline on first turn, refresh the system prompt each turn.
  if (!conversation) conversation = [{ role: 'system', content: sys }, ...buildHistory()]
  else conversation[0] = { role: 'system', content: sys }
  repairConversation()
  store.pushTimeline({ kind: 'user', text: userText, images: images.length ? images : undefined })
  conversation.push({ role: 'user', content: userContent })
  const messages: ToolMsg[] = conversation

  controller = new AbortController()
  const signal = controller.signal

  try {
    if (eff.supercode) {
      for (const directive of SUPERCODE_STAGES) {
        messages.push({ role: 'user', content: directive })
        await agentSteps(messages, route.model, eff, signal)
      }
    } else {
      await agentSteps(messages, route.model, eff, signal)
      for (let r = 0; r < eff.reviewPasses; r++) {
        messages.push({ role: 'user', content: 'Review what you just did for bugs, edge cases, and polish. Fix anything wrong with your tools. If it is already correct, say so briefly.' })
        await agentSteps(messages, route.model, eff, signal)
      }
      if (eff.verifyLoops > 0) {
        messages.push({ role: 'user', content: 'Run or test the result and fix any errors until it works. If there is nothing to run, double-check the code is correct.' })
        await agentSteps(messages, route.model, eff, signal)
      }
    }

    const st = useArc.getState()
    st.setStatus('idle')
    st.setArcy('success', 'agent')
    window.setTimeout(() => useArc.getState().setArcy('idle', 'agent'), 1500)
  } catch (e) {
    const st = useArc.getState()
    if (isAbort(e)) {
      st.setStatus('idle')
      st.setArcy('idle', 'agent')
    } else {
      st.pushTimeline({ kind: 'error', text: userMessageFor(e) })
      st.setStatus('error')
      st.setArcy('fixing', 'agent')
      window.setTimeout(() => useArc.getState().setArcy('idle', 'agent'), 2200)
    }
  } finally {
    controller = null
    useArc.getState().setBoost(false)
    useArc.getState().clearStreamFile()
    trimConversation()
    scheduleSave()
  }
}
