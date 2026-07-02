import { keyPool, ZAI_API_KEY, ultraLimiter } from '../config/keys'
import { ARC_MODELS, type ArcModel, type ArcModelId } from '../config/providers'
import { parseLooseJson } from './jsonParse'

// ── Message + tool types (OpenAI-compatible) ───────────────────────────────────
export type ChatContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ToolMsg {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: ChatContent | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

export interface ToolDef {
  type: 'function'
  function: { name: string; description: string; parameters: unknown }
}

export interface ToolStreamEvents {
  onText?: (delta: string) => void
  onReasoning?: (delta: string) => void
  onToolDelta?: (index: number, name: string | undefined, argsFragment: string, id?: string) => void
}

export interface ToolStreamResult {
  text: string
  reasoning: string
  toolCalls: ToolCall[]
  finishReason: string
  /** True when the model was cut off (finish_reason === 'length'); tool calls may be partial. */
  truncated: boolean
}

export interface ArcChatOpts {
  temperature?: number
  top_p?: number
  maxTokens?: number
  /** Stream reasoning ("thinking"). Default true for transparency; false for the fast path. */
  reasoning?: boolean
  /** Force tool use: 'required' makes the model call a tool this turn (breaks narration stalls). */
  toolChoice?: 'auto' | 'required' | 'none'
  signal?: AbortSignal
}

function providerExtras(m: ArcModel, reasoning: boolean): Record<string, unknown> {
  // Arc3Mini (GLM) is a reasoning model — toggle thinking by effort so low-effort
  // turns stay instant and higher ones stream visible reasoning.
  if (m.provider === 'zai') return { thinking: { type: reasoning ? 'enabled' : 'disabled' } }
  // Arc3Ultra (MiniMax): reasoning is OFF unless we pass this — then it streams as reasoning_content.
  if (m.provider === 'nvidia') return reasoning ? { chat_template_kwargs: { thinking: true } } : {}
  return {}
}

// ── Friendly errors — never leak the provider, quota internals, keys, or raw text ─
export type ArcErrorKind = 'busy' | 'exhausted' | 'network' | 'unreachable' | 'unknown'

const MSG: Record<Exclude<ArcErrorKind, 'unknown'>, string> = {
  busy: 'Arc’s servers are busy right now — please come back in a little while.',
  exhausted: 'Free usage is exhausted for now — please come back in a while.',
  network: 'Connection problem — check your internet and try again.',
  unreachable: 'Arc can’t be reached right now — please try again shortly.',
}

export class ArcError extends Error {
  kind: ArcErrorKind
  userMessage: string
  /** Internal-only status; never derived from or containing upstream text. */
  status?: number
  constructor(kind: ArcErrorKind, userMessage: string, status?: number) {
    // IMPORTANT: message carries no upstream body/provider text — only the kind.
    super(`arc:${kind}`)
    this.name = 'ArcError'
    this.kind = kind
    this.userMessage = userMessage
    this.status = status
  }
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/** Map any thrown value to a safe, user-facing message (never leaks provider details). */
export function userMessageFor(err: unknown): string {
  if (err instanceof ArcError) return err.userMessage
  return MSG.unreachable
}

// ── retry/backoff helpers ───────────────────────────────────────────────────────
const MAX_RETRIES = 4
const BACKOFF_BASE_MS = 900
const BACKOFF_CAP_MS = 20_000
// How long to wait for the FIRST token before treating the provider as unresponsive.
// Only applies before any token arrives — a stream that has started is never bounded.
// Set above MiniMax-m2.7's observed cold-start (~56s) so a cold-but-healthy worker gets
// to warm up rather than falsely failing over; still ends a genuine hang.
const TTFT_MS = 75_000

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

function backoff(attempt: number): number {
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt) + Math.random() * 400
}

function retryAfterMs(res: Response): number | null {
  const h = Number(res.headers.get('retry-after'))
  return Number.isFinite(h) && h > 0 ? h * 1000 : null
}

/**
 * Authenticated POST with rate-limit waits, round-robin keys (NVIDIA), the global
 * Arc3Ultra cap, backoff, and friendly error mapping. Returns an OK Response;
 * throws ArcError or AbortError. The global slot is taken last (right before fetch)
 * so its timestamp matches the real request time and aborts don't record phantoms.
 */
async function arcFetch(m: ArcModel, body: string, signal?: AbortSignal): Promise<Response> {
  const isNvidia = m.provider === 'nvidia'
  let lastKind: ArcErrorKind = 'busy'

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')

    const key = isNvidia ? await keyPool.acquire(signal) : ZAI_API_KEY
    if (isNvidia) await ultraLimiter.acquire(signal) // global ≤30 RPM, stamped at send time

    let res: Response
    try {
      res = await fetch(`${m.base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body,
        signal,
      })
    } catch (err) {
      if (isAbort(err)) throw err
      lastKind = 'network'
      if (attempt >= MAX_RETRIES) break
      await sleep(backoff(attempt), signal)
      continue
    }

    if (res.ok && res.body) return res

    if (res.status === 429 || res.status >= 500) {
      const wait = Math.min(BACKOFF_CAP_MS, retryAfterMs(res) ?? backoff(attempt))
      if (isNvidia) keyPool.penalize(key, wait)
      lastKind = 'busy'
      if (attempt >= MAX_RETRIES) break
      await sleep(wait, signal)
      continue
    }
    if (res.status === 401 || res.status === 402 || res.status === 403) {
      if (isNvidia) keyPool.penalize(key, 5 * 60_000)
      throw new ArcError('exhausted', MSG.exhausted, res.status)
    }
    // Other 4xx: log locally for debugging, surface nothing provider-specific.
    const detail = await res.text().catch(() => '')
    if (detail) console.debug('[arc] upstream error', res.status, detail.slice(0, 300))
    throw new ArcError('unreachable', MSG.unreachable, res.status)
  }
  throw new ArcError(lastKind, lastKind === 'network' ? MSG.network : MSG.busy)
}

function assertJsonish(res: Response): void {
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('html')) throw new ArcError('unreachable', MSG.unreachable, res.status)
}

// ── Streaming tool-enabled turn ─────────────────────────────────────────────────
interface ToolAcc {
  id: string
  name: string
  arguments: string
}

export async function streamArcTurn(
  modelId: ArcModelId,
  messages: ToolMsg[],
  tools: ToolDef[] = [],
  events: ToolStreamEvents = {},
  opts: ArcChatOpts = {},
): Promise<ToolStreamResult> {
  const m = ARC_MODELS[modelId]
  const body = JSON.stringify({
    model: m.model,
    messages,
    ...(tools.length ? { tools, tool_choice: opts.toolChoice ?? 'auto' } : {}),
    ...providerExtras(m, opts.reasoning ?? true),
    temperature: opts.temperature ?? 0.5,
    top_p: opts.top_p ?? 0.9,
    max_tokens: opts.maxTokens ?? 4096,
    // Arc3Ultra (MiniMax on NIM) is prone to repetition collapse (streams of "/> ">
    // when it dumps big HTML) — a mild frequency penalty pulls it out of the loop.
    ...(m.provider === 'nvidia' ? { frequency_penalty: 0.4 } : {}),
    stream: true,
  })

  // Time-to-FIRST-token watchdog. This only bounds the wait BEFORE any token arrives
  // and self-disables the instant the model streams anything, so (unlike a per-stream
  // timeout) it can never interrupt a response that's flowing. It turns a provider that
  // connects-but-never-answers (e.g. NVIDIA having issues) into a clean error instead of
  // an endless "Arc is working…". We drive it through a linked inner AbortController.
  const inner = new AbortController()
  if (opts.signal) {
    if (opts.signal.aborted) inner.abort()
    else opts.signal.addEventListener('abort', () => inner.abort(), { once: true })
  }
  let timedOut = false
  let ttft: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    timedOut = true
    inner.abort()
  }, TTFT_MS)
  const clearTtft = () => {
    if (ttft !== undefined) {
      clearTimeout(ttft)
      ttft = undefined
    }
  }

  let res: Response
  try {
    res = await arcFetch(m, body, inner.signal)
    assertJsonish(res)
  } catch (e) {
    clearTtft()
    if (timedOut) throw new ArcError('unreachable', MSG.unreachable)
    throw e
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let text = ''
  let reasoning = ''
  let finishReason = ''
  let sawAny = false
  const accs: ToolAcc[] = []
  const idSlot = new Map<string, number>()

  // Degeneration guard: if the model collapses into repeating a tiny fragment
  // (e.g. "/> "/> "/> …), stop the stream so we don't burn the whole token budget
  // on garbage — whatever real content/tool-call came before is still recovered.
  let degenerate = false
  let prevFrag = ''
  let repeatRun = 0
  const feedDegen = (d: string) => {
    const t = d.trim()
    if (t && t.length <= 8 && t === prevFrag) {
      if (++repeatRun >= 80) degenerate = true
    } else {
      prevFrag = t
      repeatRun = 0
    }
  }

  const processData = (data: string) => {
    if (!data || data === '[DONE]') return
    let json: unknown
    try {
      json = JSON.parse(data)
    } catch {
      return
    }
    const choice = (json as { choices?: Array<Record<string, unknown>> })?.choices?.[0]
    if (!choice) return
    sawAny = true
    clearTtft() // first real token — drop the watchdog; a flowing stream is never bounded
    const delta = choice.delta as
      | { content?: string | null; reasoning_content?: string | null; reasoning?: string | null; tool_calls?: Array<Record<string, unknown>> }
      | undefined
    if (typeof choice.finish_reason === 'string' && choice.finish_reason) finishReason = choice.finish_reason
    const r = delta?.reasoning_content ?? delta?.reasoning
    if (r) {
      reasoning += r
      feedDegen(r)
      events.onReasoning?.(r)
    }
    if (delta?.content) {
      text += delta.content
      feedDegen(delta.content)
      events.onText?.(delta.content)
    }
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        let idx: number
        if (typeof tc.index === 'number') idx = tc.index as number
        else {
          const id = typeof tc.id === 'string' ? tc.id : ''
          if (id && idSlot.has(id)) idx = idSlot.get(id)!
          else {
            idx = accs.length || 0
            if (id) idSlot.set(id, idx)
          }
        }
        if (!accs[idx]) accs[idx] = { id: '', name: '', arguments: '' }
        const acc = accs[idx]
        if (typeof tc.id === 'string' && tc.id) acc.id = tc.id
        const fn = tc.function as { name?: string; arguments?: string } | undefined
        if (fn?.name) acc.name = fn.name
        const frag = fn?.arguments ?? ''
        if (frag) acc.arguments += frag
        events.onToolDelta?.(idx, fn?.name, frag, acc.id || undefined)
      }
    }
  }
  const processLine = (line: string) => {
    const t = line.trim()
    if (t.startsWith('data:')) processData(t.slice(5).trim())
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) processLine(line)
      if (degenerate) {
        await reader.cancel().catch(() => {})
        break
      }
    }
  } catch (err) {
    clearTtft()
    if (timedOut) throw new ArcError('unreachable', MSG.unreachable) // never streamed a token
    if (isAbort(err)) throw err
    throw new ArcError('network', MSG.network)
  }
  clearTtft()
  // Flush decoder + process any residual (un-terminated) trailing line.
  buf += decoder.decode()
  for (const line of buf.split('\n')) processLine(line)

  const truncated = finishReason === 'length' || degenerate
  let toolCalls: ToolCall[] = accs
    .filter(Boolean)
    .map((a, i) => ({ id: a.id || `call-${i}`, type: 'function' as const, function: { name: a.name, arguments: a.arguments } }))
    // Drop calls whose args clearly didn't finish arriving.
    .filter((c) => !truncated || c.function.arguments.trim() === '' || parseLooseJson(c.function.arguments) !== null)

  // Inline tool-call fallback for models that emit tool calls as TEXT instead of
  // structured deltas — XML dialects, or (Arc3Ultra/MiniMax on NIM) a JSON array using
  // "parameters"/"arguments". Validated against the real tool names so ordinary JSON
  // in a reply is never mistaken for a tool call.
  let cleanText = text
  if (toolCalls.length === 0 && text.trim()) {
    const inline = extractInlineToolCalls(text, new Set(tools.map((t) => t.function.name)))
    if (inline.calls.length) {
      toolCalls = inline.calls
      cleanText = inline.cleanText
    }
  }

  // Degenerate/empty stream → engage the error path instead of returning silent empty.
  if (!sawAny && !cleanText && toolCalls.length === 0) {
    throw new ArcError('unreachable', MSG.unreachable)
  }

  return { text: cleanText, reasoning, toolCalls, finishReason, truncated }
}

/** Scan out the first balanced {...}/[...] block and where it starts (for stripping it from prose). */
function firstJsonBlock(s: string): { block: string; start: number } | null {
  const start = s.search(/[[{]/)
  if (start === -1) return null
  const open = s[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return { block: s.slice(start, i + 1), start }
    }
  }
  return null // unterminated (e.g. truncated) — no reliable block
}

export function extractInlineToolCalls(text: string, validNames?: Set<string>): { calls: ToolCall[]; cleanText: string } {
  let i = 0

  // Dialect A: <tool_call>{ "name": "...", "arguments"/"parameters": {...} }</tool_call>
  const aStart = text.search(/<tool_call>/)
  if (aStart >= 0) {
    const calls: ToolCall[] = []
    const tcRe = /<tool_call>\s*([\s\S]*?)\s*(?:<\/tool_call>|$)/g
    let tm: RegExpExecArray | null
    while ((tm = tcRe.exec(text))) {
      const obj = parseLooseJson(tm[1]) as { name?: string; arguments?: unknown; parameters?: unknown } | null
      if (obj?.name) {
        const rawArgs = obj.arguments ?? obj.parameters
        const args = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs ?? {})
        calls.push({ id: `inline-${i++}`, type: 'function', function: { name: obj.name, arguments: args } })
      }
      if (!tm[0].endsWith('</tool_call>')) break
    }
    if (calls.length) return { calls, cleanText: text.slice(0, aStart).trim() }
  }

  // Dialect B: <function=NAME><parameter=P>VALUE</parameter></function>
  const bStart = text.search(/<function=/)
  if (bStart >= 0) {
    const calls: ToolCall[] = []
    const fnRe = /<function=([^>\s]+)\s*>([\s\S]*?)(?:<\/function>|$)/g
    let m: RegExpExecArray | null
    while ((m = fnRe.exec(text))) {
      const name = m[1].trim()
      const argBody = m[2]
      const args: Record<string, unknown> = {}
      const pRe = /<parameter=([^>\s]+)\s*>\n?([\s\S]*?)(?:\n?<\/parameter>|$)/g
      let pm: RegExpExecArray | null
      while ((pm = pRe.exec(argBody))) {
        const raw = pm[2].trim()
        const parsed = parseLooseJson(raw)
        args[pm[1].trim()] = parsed !== null ? parsed : raw
      }
      if (name) calls.push({ id: `inline-${i++}`, type: 'function', function: { name, arguments: JSON.stringify(args) } })
      if (!m[0].endsWith('</function>')) break
    }
    if (calls.length) return { calls, cleanText: text.slice(0, bStart).trim() }
  }

  // Dialect C: a JSON array/object of tool calls emitted as plain text (MiniMax on NIM),
  // e.g. [ { "name": "write_file", "parameters": {...} } ]. Only accepted when the object's
  // name matches a REAL tool, so a normal JSON answer is never hijacked.
  if (validNames && validNames.size) {
    const jb = firstJsonBlock(text)
    if (jb) {
      const parsed = parseLooseJson(jb.block)
      const arr = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? [parsed] : []
      const calls: ToolCall[] = []
      for (const o of arr as Array<{ name?: unknown; arguments?: unknown; parameters?: unknown }>) {
        const name = typeof o?.name === 'string' ? o.name : ''
        if (!name || !validNames.has(name)) continue
        const rawArgs = o.arguments ?? o.parameters ?? {}
        const args = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs)
        calls.push({ id: `inline-${i++}`, type: 'function', function: { name, arguments: args } })
      }
      if (calls.length) return { calls, cleanText: text.slice(0, jb.start).trim() }
    }
  }

  return { calls: [], cleanText: text }
}

// ── Non-streaming helpers (internal pipeline steps, judges, etc.) ────────────────
export async function chatArc(modelId: ArcModelId, messages: ToolMsg[], opts: ArcChatOpts = {}): Promise<string> {
  const m = ARC_MODELS[modelId]
  const body = JSON.stringify({
    model: m.model,
    messages,
    ...providerExtras(m, opts.reasoning ?? false),
    temperature: opts.temperature ?? 0.5,
    top_p: opts.top_p ?? 0.9,
    max_tokens: opts.maxTokens ?? 4096,
    stream: false,
  })
  const res = await arcFetch(m, body, opts.signal)
  assertJsonish(res)
  let raw: string
  try {
    raw = await res.text()
  } catch (err) {
    if (isAbort(err)) throw err
    throw new ArcError('network', MSG.network)
  }
  const data = parseLooseJson(raw) as { choices?: Array<{ message?: { content?: string } }> } | null
  return data?.choices?.[0]?.message?.content ?? ''
}

export async function chatArcJson<T>(
  modelId: ArcModelId,
  messages: ToolMsg[],
  coerce: (o: unknown) => T,
  opts: ArcChatOpts = {},
): Promise<T> {
  const safeCoerce = (o: unknown): T => {
    try {
      return coerce(o)
    } catch {
      throw new ArcError('unknown', 'Arc had trouble formatting a response — please try again.')
    }
  }
  const content = await chatArc(modelId, messages, opts)
  const parsed = parseLooseJson(content)
  if (parsed !== null) return safeCoerce(parsed)
  const retry: ToolMsg[] = [
    ...messages,
    { role: 'assistant', content },
    { role: 'user', content: 'That was not valid JSON. Reply with ONLY the JSON object, nothing else.' },
  ]
  const content2 = await chatArc(modelId, retry, opts)
  const parsed2 = parseLooseJson(content2)
  if (parsed2 !== null) return safeCoerce(parsed2)
  throw new ArcError('unknown', 'Arc had trouble formatting a response — please try again.')
}
