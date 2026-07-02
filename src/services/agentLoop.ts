import { useArc } from '../store/arc'
import { routeModel } from './router'
import { streamArcTurn, chatArc, userMessageFor, isAbort, ArcError, type ToolMsg } from './arcChat'
import { buildSystemPrompt } from '../config/prompts'
import { effortConfig, type EffortConfig, type EffortLevel } from './effort'
import { TOOL_DEFS, executeTool, parseArgs, titleFor, arcyFor, showsCard, resetToolMemory } from './tools'
import { scheduleSave } from './persistence'
import { cancelQuestion } from './askUser'
import { readFile, killActiveProcesses } from './webcontainer'
import { ARC_MODELS, type ArcModelId } from '../config/providers'

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

// Build a live title/detail from a (possibly unfinished) streamed tool-args string,
// so the chat action card fills in word-by-word as the model types the call.
function liveTitle(name: string, args: string): string {
  return titleFor(name, {
    path: partialField(args, 'path') ?? undefined,
    from: partialField(args, 'from') ?? undefined,
    to: partialField(args, 'to') ?? undefined,
    command: partialField(args, 'command') ?? undefined,
  } as Record<string, unknown>)
}
function liveDetail(name: string, args: string): string | null {
  switch (name) {
    case 'edit_file':
      return `- ${partialField(args, 'search') ?? ''}\n+ ${partialField(args, 'replace') ?? ''}`
    case 'run_command':
      return partialField(args, 'command')
    case 'web_search':
    case 'deep_research':
      return partialField(args, 'query')
    default:
      return null // write_file mirrors the live editor stream; others have no body
  }
}

// One continuous tool loop per turn. The budget scales with effort — NOT by running
// multiple sub-loops (that used to multiply narration stalls into minutes-long hangs).
function iterBudgetFor(eff: EffortConfig): number {
  const budgets: Record<EffortLevel, number> = { low: 12, medium: 18, high: 26, max: 34, supercode: 44 }
  return budgets[eff.level]
}

// Safety ceiling for a tool result fed back to the model. Each tool already caps its
// OWN output sensibly (read_file paginates at 60K, run_command/search at 6–8K), so this
// is only a backstop — it must stay ABOVE read_file's cap or it re-truncates whole files.
const MAX_TOOL_RESULT = 64_000

// Shown to the model after a prose-only turn in Build mode: nothing happened, so act.
const STALL_NUDGE =
  'That reply did nothing — you wrote text but called no tool. Act now with a tool call: write_file / edit_file / run_command / start_dev_server to make real progress, or call `complete` if the whole task is truly finished. Do not reply with prose again.'

let controller: AbortController | null = null

// The last turn's inputs, so a failed turn can be replayed on another model (failover).
let lastTurn: { userText: string; images: string[]; attachments: string } | null = null

// A provider that's down/unresponsive → offer to continue on the OTHER model (a
// different provider), which is very likely still up. Only for availability errors.
function altModelFor(e: unknown, current: ArcModelId): ArcModelId | null {
  if (!(e instanceof ArcError)) return null
  if (e.kind === 'busy' || e.kind === 'unreachable' || e.kind === 'network' || e.kind === 'exhausted') {
    return current === 'arc3ultra' ? 'arc3mini' : 'arc3ultra'
  }
  return null
}

/**
 * Retry the last turn on a different model (one-click failover from an error card).
 * The failed user message is already in the thread + timeline, so we drop that
 * exchange first and let runTurn replay it cleanly on the chosen model.
 */
export function retryOn(model: ArcModelId): void {
  if (isRunning() || !lastTurn) return
  const t = lastTurn
  const store = useArc.getState()
  store.setOverride(model) // an explicit switch — honoured by the router
  if (conversation && conversation[conversation.length - 1]?.role === 'user') conversation.pop()
  store.dropLastExchange()
  void runTurn(t.userText, t.images, t.attachments)
}

// The full model thread (system + every user/assistant/tool message), kept across
// turns so context — including prior tool calls and their results — is preserved.
let conversation: ToolMsg[] | null = null

/** Reset the thread (new project / resumed project). */
export function resetConversation(): void {
  conversation = null
  resetToolMemory() // read/list gates are per-project
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

type StepOutcome = 'complete' | 'answered' | 'stalled' | 'budget'

/**
 * One continuous agent loop. Streams a turn, executes its tool calls, repeats.
 * A prose-only turn in Build mode means the model narrated instead of acting: we nudge
 * once and FORCE a tool call on the retry (do work, or call `complete`). If it still
 * won't act, we stop rather than loop forever.
 */
async function agentSteps(messages: ToolMsg[], model: ArcModelId, eff: EffortConfig, signal: AbortSignal, iterBudget: number): Promise<StepOutcome> {
  const buildMode = useArc.getState().mode === 'build'
  const tools = useArc.getState().mode === 'ask' ? [] : TOOL_DEFS
  let stalls = 0
  let forceTools = false
  let lastText = ''

  for (let iter = 0; iter < iterBudget; iter++) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')

    // Timeline items are created lazily — only when text/reasoning actually streams —
    // so prose-free tool turns don't leave empty "Thinking" bubbles behind.
    let reasoningId: string | undefined
    let assistantId: string | undefined
    let rawReason = ''
    let rawText = ''
    const argBuf = new Map<number, { name: string; args: string; cardId?: string; id?: string }>()

    const events = {
      onReasoning: (d: string) => {
        rawReason += d
        useArc.getState().addContext(estimateTokens(d)) // meter climbs live so a long turn doesn't look frozen
        if (!reasoningId) reasoningId = useArc.getState().pushTimeline({ kind: 'reasoning', text: '' })
        useArc.getState().updateTimeline(reasoningId, { text: rawReason })
      },
      onText: (d: string) => {
        rawText += d
        useArc.getState().addContext(estimateTokens(d))
        if (!assistantId) assistantId = useArc.getState().pushTimeline({ kind: 'assistant', text: '' })
        useArc.getState().updateTimeline(assistantId, { text: rawText })
      },
      // As Arc "types" a tool call, show it live in the chat: an action card appears
      // immediately and its body (file content, command, query) fills in word-by-word.
      onToolDelta: (index: number, name: string | undefined, frag: string, id?: string) => {
        const e = argBuf.get(index) ?? { name: '', args: '' }
        if (name) e.name = name
        if (id) e.id = id
        e.args += frag
        argBuf.set(index, e)
        const st = useArc.getState()
        if (frag) st.addContext(estimateTokens(frag)) // file-write streaming moves the meter too
        if (e.name && showsCard(e.name) && e.name !== 'complete') {
          const path = e.name === 'write_file' ? partialField(e.args, 'path') : null
          const np = path ? '/' + path.replace(/^\/+/, '') : undefined
          if (!e.cardId) {
            e.cardId = st.pushTimeline({ kind: 'action', tool: e.name, title: liveTitle(e.name, e.args), status: 'running', path: np })
            argBuf.set(index, e)
          } else {
            st.updateTimeline(e.cardId, { title: liveTitle(e.name, e.args), ...(np ? { path: np } : {}), detail: liveDetail(e.name, e.args) ?? undefined })
          }
        }
        if (e.name === 'write_file') {
          const path = partialField(e.args, 'path')
          if (path) st.setStreamFile('/' + path.replace(/^\/+/, ''), partialField(e.args, 'content') ?? '')
        }
      },
    }

    // Forcing tools (tool_choice:'required') breaks narration stalls; if a provider
    // rejects it, fall back to 'auto' so we never surface a spurious error.
    let res
    try {
      res = await streamArcTurn(model, messages, tools, events, { reasoning: eff.reasoning, maxTokens: eff.maxTokens, toolChoice: forceTools ? 'required' : 'auto', signal })
    } catch (e) {
      if (forceTools && !isAbort(e)) res = await streamArcTurn(model, messages, tools, events, { reasoning: eff.reasoning, maxTokens: eff.maxTokens, signal })
      else throw e
    }
    forceTools = false

    const st = useArc.getState()
    if (reasoningId) st.updateTimeline(reasoningId, { text: res.reasoning, done: true })
    if (assistantId) st.updateTimeline(assistantId, { text: res.text })
    // Context is now tallied live in the delta handlers above — no end-of-turn add.

    // Any card we started rendering for a tool call that didn't survive (e.g. a large
    // write_file truncated by the token limit) must be resolved, never left spinning.
    const sweepOrphans = (resolved?: Set<string>) => {
      for (const e of argBuf.values()) {
        if (e.cardId && (!resolved || !resolved.has(e.cardId))) useArc.getState().updateTimeline(e.cardId, { status: 'error' })
      }
    }

    if (res.toolCalls.length === 0) {
      sweepOrphans()
      useArc.getState().clearStreamFile()
      if (!buildMode) return 'answered' // Ask/Plan: a prose reply IS the deliverable.
      // Build mode: prose-only accomplished nothing. Nudge + force a tool on the retry.
      const repeat = !!res.text.trim() && res.text.trim() === lastText
      lastText = res.text.trim()
      stalls++
      if (stalls >= 2 || repeat) return 'stalled' // already forced once (or looping) — stop, don't hang.
      messages.push({ role: 'user', content: STALL_NUDGE })
      forceTools = true
      continue
    }

    stalls = 0
    lastText = ''
    messages.push({ role: 'assistant', content: res.text || null, tool_calls: res.toolCalls })
    st.setStatus('working')
    const isComplete = res.toolCalls.some((tc) => tc.function.name === 'complete')
    // Match streamed cards to surviving calls by tool_call id (robust to dropped calls
    // shifting positions); fall back to positional index when ids are absent.
    const byId = new Map<string, { cardId?: string }>()
    for (const e of argBuf.values()) if (e.id) byId.set(e.id, e)
    const resolved = new Set<string>()

    for (let ci = 0; ci < res.toolCalls.length; ci++) {
      const tc = res.toolCalls[ci]
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      const name = tc.function.name
      const args = parseArgs(tc.function.arguments)
      const a = arcyFor(name)
      useArc.getState().setArcy(a.activity, a.target)
      let cardId = (tc.id && byId.get(tc.id)?.cardId) || argBuf.get(ci)?.cardId
      const np = name === 'write_file' ? '/' + String(args.path ?? '').replace(/^\/+/, '') : undefined
      if (showsCard(name)) {
        if (cardId) useArc.getState().updateTimeline(cardId, { title: titleFor(name, args), status: 'running', ...(np ? { path: np } : {}) })
        else cardId = useArc.getState().pushTimeline({ kind: 'action', tool: name, title: titleFor(name, args), status: 'running', path: np })
      } else {
        cardId = undefined
      }
      if (name === 'write_file' && typeof args.content === 'string' && np && np !== '/') {
        const cur = useArc.getState().streamFile
        if (!cur || cur.path !== np || cur.content.length < args.content.length) {
          await revealFile(np, args.content, signal)
        }
      }
      const out = await executeTool(name, args)
      if (cardId) {
        useArc.getState().updateTimeline(cardId, { status: out.ok ? 'done' : 'error', detail: out.detail })
        resolved.add(cardId)
      }
      messages.push({ role: 'tool', tool_call_id: tc.id, name, content: out.result.slice(0, MAX_TOOL_RESULT) })
    }
    sweepOrphans(resolved)
    useArc.getState().clearStreamFile()
    if (isComplete) return 'complete'
  }
  return 'budget'
}

export async function runTurn(userText: string, images: string[] = [], attachments = ''): Promise<void> {
  const store = useArc.getState()
  if (isRunning() || !userText.trim()) return
  lastTurn = { userText, images, attachments } // remembered for one-click failover on error
  store.resetBaselines() // diff gutters reflect what changes in THIS turn
  // Extra context (e.g. @-referenced file contents) goes to the model but not the visible message.
  const modelText = attachments ? `${userText}\n\n${attachments}` : userText

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
    ? [{ type: 'text', text: modelText }, ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } }))]
    : modelText

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
    // Single continuous loop. Effort shapes the SYSTEM PROMPT (how thorough — spec,
    // self-review, verification, SUPERCODE critic pass) and the iteration budget —
    // never extra sub-loops, which used to multiply narration stalls into long hangs.
    await agentSteps(messages, route.model, eff, signal, iterBudgetFor(eff))

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
      const alt = altModelFor(e, route.model)
      const text = alt ? `${ARC_MODELS[route.model].label} isn’t responding right now.` : userMessageFor(e)
      st.pushTimeline({ kind: 'error', text, retry: alt ?? undefined })
      st.setStatus('error')
      st.setArcy('fixing', 'agent')
      window.setTimeout(() => useArc.getState().setArcy('idle', 'agent'), 2200)
    }
  } finally {
    controller = null
    useArc.getState().setBoost(false)
    useArc.getState().clearStreamFile()
    // Stop / a mid-stream error can leave action cards mid-flight — never leave a spinner.
    useArc.getState().finishRunningCards()
    trimConversation()
    scheduleSave()
  }
}
