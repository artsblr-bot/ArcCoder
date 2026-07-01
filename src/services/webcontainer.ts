import { WebContainer, type FileSystemTree, type WebContainerProcess } from '@webcontainer/api'

// WebContainer boots exactly once per page. Everything funnels through this singleton.
let bootPromise: Promise<WebContainer> | null = null
let instance: WebContainer | null = null

export function isCrossOriginIsolated(): boolean {
  return typeof globalThis !== 'undefined' && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true
}

export class ContainerUnavailableError extends Error {
  userMessage = 'Arc’s workspace engine could not start in this browser. Try a Chromium-based browser, and make sure the page is served with cross-origin isolation.'
}

export async function getContainer(): Promise<WebContainer> {
  if (instance) return instance
  if (!bootPromise) {
    if (!isCrossOriginIsolated()) {
      // Boot will fail without COOP/COEP — fail fast with a clear message.
      return Promise.reject(new ContainerUnavailableError())
    }
    bootPromise = WebContainer.boot({ coep: 'require-corp', forwardPreviewErrors: true }).then((wc) => {
      instance = wc
      return wc
    })
  }
  return bootPromise
}

// ── Filesystem helpers ──────────────────────────────────────────────────────────
function parentDir(path: string): string {
  const i = path.lastIndexOf('/')
  return i <= 0 ? '' : path.slice(0, i)
}

export async function ensureDir(path: string): Promise<void> {
  if (!path) return
  const wc = await getContainer()
  await wc.fs.mkdir(path, { recursive: true })
}

export async function writeFile(path: string, contents: string | Uint8Array): Promise<void> {
  const wc = await getContainer()
  const dir = parentDir(path)
  if (dir) await wc.fs.mkdir(dir, { recursive: true })
  await wc.fs.writeFile(path, contents as string)
}

export async function readFile(path: string): Promise<string> {
  const wc = await getContainer()
  return wc.fs.readFile(path, 'utf-8')
}

export async function removePath(path: string): Promise<void> {
  const wc = await getContainer()
  await wc.fs.rm(path, { recursive: true, force: true })
}

export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  const wc = await getContainer()
  const dir = parentDir(newPath)
  if (dir) await wc.fs.mkdir(dir, { recursive: true })
  await wc.fs.rename(oldPath, newPath)
}

export interface DirEntry {
  name: string
  path: string
  dir: boolean
}

export async function listDir(path: string): Promise<DirEntry[]> {
  const wc = await getContainer()
  const base = path === '/' ? '' : path.replace(/\/$/, '')
  const entries = await wc.fs.readdir(base || '/', { withFileTypes: true })
  return entries
    .map((e) => ({ name: e.name, path: `${base}/${e.name}`, dir: e.isDirectory() }))
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
}

const IGNORED = new Set(['node_modules', '.git', '.cache', 'dist'])

// Files we must round-trip as bytes (base64) — reading them as UTF-8 would corrupt them.
const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|ico|icns|woff2?|ttf|otf|eot|mp3|wav|ogg|mp4|webm|mov|pdf|zip|gz|tar|wasm|jar|class|psd|sketch|fig)$/i
export function isBinaryPath(p: string): boolean {
  return BINARY_EXT.test(p)
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(bin)
}
export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Recursively read the project's TEXT files into a flat { path: contents } map. */
export async function readProjectFiles(root = ''): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const walk = async (dir: string) => {
    const entries = await listDir(dir || '/')
    for (const e of entries) {
      if (IGNORED.has(e.name)) continue
      if (e.dir) await walk(e.path)
      else if (!isBinaryPath(e.name)) {
        try {
          out[e.path.replace(/^\//, '')] = await readFile(e.path)
        } catch {
          /* unreadable — skip */
        }
      }
    }
  }
  await walk(root)
  return out
}

/** All file paths in the project (name-only, no reads) — used by Explorer search. */
export async function listAllFiles(root = ''): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string) => {
    const entries = await listDir(dir || '/')
    for (const e of entries) {
      if (IGNORED.has(e.name)) continue
      if (e.dir) await walk(e.path)
      else out.push(e.path.replace(/^\//, ''))
    }
  }
  await walk(root)
  return out
}

export interface ProjectSnapshot {
  files: Record<string, string> // text
  binaries: Record<string, string> // base64
}

/** Full snapshot preserving binary files as base64 (for persistence + ZIP export). */
export async function readProjectSnapshot(root = ''): Promise<ProjectSnapshot> {
  const wc = await getContainer()
  const files: Record<string, string> = {}
  const binaries: Record<string, string> = {}
  const walk = async (dir: string) => {
    const entries = await listDir(dir || '/')
    for (const e of entries) {
      if (IGNORED.has(e.name)) continue
      if (e.dir) await walk(e.path)
      else {
        const key = e.path.replace(/^\//, '')
        try {
          if (isBinaryPath(e.name)) binaries[key] = toBase64(await wc.fs.readFile(e.path))
          else files[key] = await readFile(e.path)
        } catch {
          /* unreadable — skip */
        }
      }
    }
  }
  await walk(root)
  return { files, binaries }
}

/** Mount a snapshot, decoding base64 binaries back to bytes. */
export async function mountSnapshot(snap: ProjectSnapshot): Promise<void> {
  await mountFiles(snap.files || {})
  for (const [path, b64] of Object.entries(snap.binaries || {})) {
    try {
      await writeFile('/' + path.replace(/^\/+/, ''), fromBase64(b64))
    } catch {
      /* skip */
    }
  }
}

// ── Mounting ─────────────────────────────────────────────────────────────────────
/** Turn a flat { 'src/App.tsx': '...' } map into a WebContainer FileSystemTree. */
export function filesToTree(files: Record<string, string>): FileSystemTree {
  const tree: FileSystemTree = {}
  for (const [path, contents] of Object.entries(files)) {
    const parts = path.split('/').filter(Boolean)
    let node = tree
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const last = i === parts.length - 1
      if (last) {
        node[part] = { file: { contents } }
      } else {
        if (!node[part] || !('directory' in node[part])) node[part] = { directory: {} }
        node = (node[part] as { directory: FileSystemTree }).directory
      }
    }
  }
  return tree
}

export async function mountFiles(files: Record<string, string>): Promise<void> {
  const wc = await getContainer()
  await wc.mount(filesToTree(files))
}

// ── Processes ─────────────────────────────────────────────────────────────────────
export interface SpawnOptions {
  cwd?: string
  env?: Record<string, string>
  terminal?: { cols: number; rows: number }
}

// Force every spawned command to be non-interactive so it can't hang the terminal
// waiting for keyboard input (npx "Ok to proceed?", npm prompts, etc.).
const NONINTERACTIVE_ENV: Record<string, string> = {
  CI: 'true',
  npm_config_yes: 'true',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  npm_config_progress: 'false',
  npm_config_loglevel: 'error',
  ADBLOCK: '1',
  FORCE_COLOR: '0',
}

// Track live processes so Stop can kill anything that's running right now.
const activeProcs = new Set<WebContainerProcess>()

/** Kill every running process (used by Stop, so a hung command doesn't block the agent). */
export function killActiveProcesses(): void {
  for (const p of activeProcs) {
    try {
      p.kill()
    } catch {
      /* already gone */
    }
  }
  activeProcs.clear()
}

/** Raw process (for the interactive terminal + dev server — these survive Stop). */
export async function spawnProcess(command: string, args: string[] = [], opts: SpawnOptions = {}): Promise<WebContainerProcess> {
  const wc = await getContainer()
  return wc.spawn(command, args, { ...opts, env: { ...NONINTERACTIVE_ENV, ...(opts.env ?? {}) } })
}

export interface CommandResult {
  exitCode: number
  output: string
}

/** One-shot command with captured + optionally streamed output (used by the agent's run_command tool). */
export async function runCommand(
  command: string,
  args: string[] = [],
  onChunk?: (chunk: string) => void,
  opts: SpawnOptions = {},
  timeoutMs = 120_000,
): Promise<CommandResult> {
  const proc = await spawnProcess(command, args, opts)
  // Register so Stop can kill a hung one-shot command immediately.
  activeProcs.add(proc)
  void proc.exit.then(() => activeProcs.delete(proc)).catch(() => activeProcs.delete(proc))
  let output = ''
  // Backup for any interactive prompt that slips past the env vars: type "y" once.
  let writer: WritableStreamDefaultWriter<string> | null = null
  try {
    writer = proc.input.getWriter()
  } catch {
    writer = null
  }
  let answered = 0
  const PROMPT = /(ok to proceed|\(y\/n\)|\[y\/n\]|\(y\)\s*$|overwrite\b[^?]*\?|press\s+y\b|continue\?)/i
  const sink = new WritableStream<string>({
    write(chunk) {
      output += chunk
      onChunk?.(chunk)
      if (writer && answered < 6 && PROMPT.test(chunk.slice(-120))) {
        answered++
        writer.write('y\n').catch(() => {})
      }
    },
  })
  proc.output.pipeTo(sink).catch(() => {})
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    try {
      proc.kill()
    } catch {
      /* already gone */
    }
  }, timeoutMs)
  const exitCode = await proc.exit
  clearTimeout(timer)
  if (timedOut) {
    const note =
      '\n[arc] Command stopped after timing out — it may have been waiting for keyboard input. The terminal is non-interactive: re-run with non-interactive flags (e.g. -y / --yes) or CI=true.'
    output += note
    onChunk?.(note)
    return { exitCode: 124, output }
  }
  return { exitCode, output }
}

// ── Interactive command sessions ───────────────────────────────────────────────────
// The agent can run a command and, when it pauses for input (a prompt or arrow-key
// menu), respond to it via sendCommandInput — a real interactive terminal it drives.
interface Session {
  proc: WebContainerProcess
  writer: WritableStreamDefaultWriter<string>
  buffer: string
  exited: boolean
  exitCode: number | null
  onChunk?: (c: string) => void
}
let current: Session | null = null

export interface CommandStep {
  output: string
  exitCode: number | null // null while still running (paused for input)
  waiting: boolean // true when the command paused for input
  none?: boolean // true when there was no running command to receive input
}

/** Resolve when the command exits or goes quiet (idle) after printing something. */
async function settle(s: Session, idleMs: number, hardMs = 120_000): Promise<CommandStep> {
  let lastLen = -1
  let stableAt = Date.now()
  const startedAt = Date.now()
  for (;;) {
    if (s.exited) {
      const output = s.buffer
      s.buffer = ''
      return { output, exitCode: s.exitCode, waiting: false }
    }
    if (s.buffer.length !== lastLen) {
      lastLen = s.buffer.length
      stableAt = Date.now()
    } else if (s.buffer.length > 0 && Date.now() - stableAt > idleMs) {
      const output = s.buffer
      s.buffer = ''
      return { output, exitCode: null, waiting: true }
    }
    if (Date.now() - startedAt > hardMs) {
      try {
        s.proc.kill()
      } catch {
        /* gone */
      }
      const output = s.buffer
      s.buffer = ''
      return { output: `${output}\n[arc] timed out`, exitCode: 124, waiting: false }
    }
    await new Promise((r) => setTimeout(r, 180))
  }
}

/** Start a command; resolve when it exits or pauses for input. */
export async function startCommand(command: string, args: string[], onChunk?: (c: string) => void, idleMs = 2500): Promise<CommandStep> {
  if (current && !current.exited) {
    try {
      current.proc.kill()
    } catch {
      /* gone */
    }
  }
  // A PTY (terminal) is required for interactive prompts/menus (clack, inquirer)
  // to receive keypresses we write to stdin.
  const proc = await spawnProcess(command, args, { terminal: { cols: 100, rows: 30 } })
  activeProcs.add(proc)
  const writer = proc.input.getWriter()
  const s: Session = { proc, writer, buffer: '', exited: false, exitCode: null, onChunk }
  current = s
  void proc.output
    .pipeTo(
      new WritableStream<string>({
        write(c) {
          s.buffer += c
          s.onChunk?.(c)
        },
      }),
    )
    .catch(() => {})
  void proc.exit
    .then((code) => {
      s.exited = true
      s.exitCode = code
      activeProcs.delete(proc)
    })
    .catch(() => {
      s.exited = true
      activeProcs.delete(proc)
    })
  return settle(s, idleMs)
}

/** Send keys to the paused command's stdin, then resolve on next exit/pause. */
export async function sendCommandInput(input: string, onChunk?: (c: string) => void, idleMs = 2500): Promise<CommandStep> {
  const s = current
  if (!s) return { output: 'No command is currently running to receive input. Run a command first.', exitCode: null, waiting: false, none: true }
  if (s.exited) return { output: 'The command already finished.', exitCode: s.exitCode, waiting: false }
  if (onChunk) s.onChunk = onChunk
  s.writer.write(input).catch(() => {})
  return settle(s, idleMs)
}

// ── Dev server ─────────────────────────────────────────────────────────────────────
export interface ServerInfo {
  port: number
  url: string
}

export async function onServerReady(cb: (info: ServerInfo) => void): Promise<() => void> {
  const wc = await getContainer()
  return wc.on('server-ready', (port: number, url: string) => cb({ port, url }))
}

/** Uncaught errors/rejections forwarded from the running preview app. */
export async function onPreviewError(cb: (message: string) => void): Promise<() => void> {
  const wc = await getContainer()
  return wc.on('preview-message', (m: { type?: string; message?: string; stack?: string }) => {
    if (m?.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || m?.type === 'PREVIEW_UNHANDLED_REJECTION') {
      cb(`${m.message ?? 'Uncaught error'}${m.stack ? '\n' + m.stack.slice(0, 400) : ''}`)
    }
  })
}
