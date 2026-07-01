import { useArc, type PanelId } from '../store/arc'
import type { ArcyActivity } from '../components/mascot/types'
import type { ToolDef } from './arcChat'
import { parseLooseJson } from './jsonParse'
import { termWrite } from './terminalBus'
import { runGit } from './gitShim'
import { webSearch, deepResearch } from './search'
import { askUser } from './askUser'
import {
  readFile,
  writeFile,
  removePath,
  renamePath,
  listDir,
  startCommand,
  sendCommandInput,
  spawnProcess,
  onServerReady,
} from './webcontainer'

// Friendly key tokens the model can use with send_input → real control sequences.
// Enter is a carriage return (\r): that's what a real terminal sends, and raw-mode
// TUI menus (clack/inquirer) listen for CR, not the newline a line-reader would accept.
function decodeKeys(s: string): string {
  return s
    .replace(/\{enter\}/gi, '\r')
    .replace(/\{down\}/gi, '\x1b[B')
    .replace(/\{up\}/gi, '\x1b[A')
    .replace(/\{right\}/gi, '\x1b[C')
    .replace(/\{left\}/gi, '\x1b[D')
    .replace(/\{tab\}/gi, '\t')
    .replace(/\{space\}/gi, ' ')
    .replace(/\{esc\}/gi, '\x1b')
}

// ── Tool schemas the model sees (OpenAI function format) ─────────────────────────
const str = (description: string) => ({ type: 'string', description })
function fn(name: string, description: string, props: Record<string, unknown>, required: string[]): ToolDef {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties: props, required } } }
}

export const TOOL_DEFS: ToolDef[] = [
  fn(
    'read_file',
    'Read a file to see its current contents before editing. Returns the whole file unless it is very large, in which case it is chunked — pass offset to read the next chunk.',
    { path: str('File path, e.g. src/App.tsx'), offset: { type: 'number', description: 'Character offset to start from (only needed for very large files; omit to read from the start)' } },
    ['path'],
  ),
  fn('list_dir', 'List the files and folders in a directory.', { path: str('Directory path; "/" for the project root') }, ['path']),
  fn('write_file', 'Create a new file or completely overwrite an existing one.', { path: str('File path'), content: str('Full file contents') }, ['path', 'content']),
  fn(
    'edit_file',
    'Make a targeted edit by replacing an exact snippet of an existing file. Prefer this for small changes.',
    { path: str('File path'), search: str('Exact text to find (include enough context to be unique)'), replace: str('Replacement text') },
    ['path', 'search', 'replace'],
  ),
  fn('delete_file', 'Delete a file or folder.', { path: str('Path to delete') }, ['path']),
  fn('rename', 'Rename or move a file or folder.', { from: str('Current path'), to: str('New path') }, ['from', 'to']),
  fn('run_command', 'Run a shell command in the project (npm, node, git, etc.). Output streams to the terminal. If the command pauses for input, you will be told to use send_input.', { command: str('The command line to run, e.g. "npm install" or "git status"') }, ['command']),
  fn(
    'send_input',
    'Respond to a command that is waiting for input. Use after run_command reports a command is waiting. Submit text with {enter} (e.g. "y{enter}"), navigate arrow-key menus with {up}/{down} then {enter}, or send "{enter}" alone to accept the highlighted default.',
    { input: str('Keys to send, e.g. "{enter}", "y{enter}", or "{down}{enter}"') },
    ['input'],
  ),
  fn('start_dev_server', 'Start the project dev server so the live preview appears. Defaults to "npm run dev".', { command: str('Optional command; defaults to npm run dev') }, []),
  fn('present_plan', 'Show the user a structured plan to review before a larger build.', { title: str('Short plan title'), steps: { type: 'array', items: { type: 'string' }, description: 'Ordered steps' } }, ['title', 'steps']),
  fn(
    'update_tasks',
    'Maintain the live task checklist so the user can follow progress.',
    { tasks: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, status: { type: 'string', enum: ['pending', 'active', 'done'] } }, required: ['text'] } } },
    ['tasks'],
  ),
  fn('web_search', 'Search the web for current information. Returns key facts and source URLs.', { query: str('What to search for') }, ['query']),
  fn('deep_research', 'Investigate a topic thoroughly with several searches, then synthesize.', { query: str('The research question') }, ['query']),
  fn(
    'ask_user',
    'Ask the user a question and WAIT for their answer before continuing. Use only when you genuinely need a decision or information you cannot determine yourself (not for routine steps).',
    { question: str('The question to ask'), options: { type: 'array', items: { type: 'string' }, description: 'Optional suggested answers the user can pick from' } },
    ['question'],
  ),
  fn(
    'complete',
    'Signal that the ENTIRE task is fully built, verified, and working — this is the ONLY way to end your turn in Build mode. Call it only when nothing the user asked for remains undone. If you stop without calling this, you will be told to keep going.',
    { summary: str('A brief summary of what you built') },
    [],
  ),
]

// Injected into served HTML so the cross-origin preview can talk to Arc: it forwards
// console output + runtime errors to the parent, and powers click-to-point inspect.
const INSPECTOR_SNIPPET = `(function(){
  var P=function(m){try{parent.postMessage(m,'*')}catch(e){}};
  ['log','warn','error','info'].forEach(function(k){var o=console[k]?console[k].bind(console):function(){};console[k]=function(){o.apply(null,arguments);try{P({source:'arc',kind:'console',level:k,text:Array.prototype.map.call(arguments,function(a){try{return typeof a==='string'?a:JSON.stringify(a)}catch(e){return String(a)}}).join(' ')})}catch(e){}}});
  window.addEventListener('error',function(e){P({source:'arc',kind:'error',text:(e.message||'Error')+(e.filename?(' @ '+e.filename+':'+e.lineno):'')})});
  window.addEventListener('unhandledrejection',function(e){P({source:'arc',kind:'error',text:'Unhandled rejection: '+((e.reason&&e.reason.message)||e.reason)})});
  var inspect=false,last=null;
  function sel(el){if(!el||el===document.body||el===document.documentElement)return 'body';var s=el.tagName.toLowerCase();if(el.id)return s+'#'+el.id;if(el.className&&typeof el.className==='string'){var parts=el.className.trim().split(' ').filter(Boolean).slice(0,2);if(parts.length)s+='.'+parts.join('.')}return s}
  window.addEventListener('message',function(e){var d=e.data||{};if(d.source==='arc-host'&&d.kind==='inspect'){inspect=d.on;document.body.style.cursor=inspect?'crosshair':'';if(!inspect&&last){last.style.outline='';last=null}}});
  document.addEventListener('mouseover',function(e){if(!inspect)return;if(last)last.style.outline='';last=e.target;last.style.outline='2px solid #cc785c';last.style.outlineOffset='-2px'},true);
  document.addEventListener('click',function(e){if(!inspect)return;e.preventDefault();e.stopPropagation();var t=e.target;if(last){last.style.outline='';last=null}inspect=false;document.body.style.cursor='';P({source:'arc',kind:'pick',selector:sel(t),text:((t.innerText||t.textContent||'')+'').trim().slice(0,80)})},true);
})();`
const INJECT_HTML = `<script>${INSPECTOR_SNIPPET}</script>`

// Built-in static server (so a static site previews without the model writing one).
const STATIC_SERVER = `const http=require('http'),fs=require('fs'),path=require('path');
const INJ=${JSON.stringify(INJECT_HTML)};
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.ico':'image/x-icon','.webp':'image/webp','.woff2':'font/woff2'};
function sendHtml(res,d){res.writeHead(200,{'content-type':'text/html'});res.end(d.toString()+INJ)}
http.createServer((req,res)=>{let p=decodeURIComponent((req.url||'/').split('?')[0]);if(p==='/')p='/index.html';const fp=path.join(process.cwd(),p);fs.readFile(fp,(e,d)=>{if(e){fs.readFile(path.join(process.cwd(),'index.html'),(e2,d2)=>{if(e2){res.writeHead(404);res.end('Not found')}else{sendHtml(res,d2)}})}else{const ct=T[path.extname(fp).toLowerCase()]||'application/octet-stream';if(ct==='text/html'){sendHtml(res,d)}else{res.writeHead(200,{'content-type':ct});res.end(d)}}})}).listen(3000,()=>console.log('Arc static server running on http://localhost:3000'));`

// ── Loop-facing helpers ───────────────────────────────────────────────────────────
const NO_CARD = new Set(['present_plan', 'update_tasks', 'ask_user'])
export function showsCard(name: string): boolean {
  return !NO_CARD.has(name)
}

function base(p?: string): string {
  return (p ?? '').split('/').filter(Boolean).pop() ?? p ?? ''
}

export function titleFor(name: string, a: Record<string, unknown>): string {
  switch (name) {
    case 'read_file':
      return `Read ${base(a.path as string)}`
    case 'write_file':
      return `Wrote ${base(a.path as string)}`
    case 'edit_file':
      return `Edited ${base(a.path as string)}`
    case 'list_dir':
      return `Listed ${(a.path as string) || '/'}`
    case 'delete_file':
      return `Deleted ${base(a.path as string)}`
    case 'rename':
      return `Renamed ${base(a.from as string)} → ${base(a.to as string)}`
    case 'run_command':
      return `Ran ${String(a.command ?? '').slice(0, 48)}`
    case 'send_input':
      return `Answered the prompt`
    case 'start_dev_server':
      return 'Started the dev server'
    case 'web_search':
      return `Searched the web`
    case 'deep_research':
      return `Researched the topic`
    case 'complete':
      return `Build complete`
    default:
      return name
  }
}

const ARCY: Record<string, { activity: ArcyActivity; target: PanelId }> = {
  read_file: { activity: 'thinking', target: 'editor' },
  list_dir: { activity: 'thinking', target: 'explorer' },
  write_file: { activity: 'coding', target: 'editor' },
  edit_file: { activity: 'coding', target: 'editor' },
  delete_file: { activity: 'building', target: 'explorer' },
  rename: { activity: 'building', target: 'explorer' },
  run_command: { activity: 'building', target: 'terminal' },
  send_input: { activity: 'building', target: 'terminal' },
  start_dev_server: { activity: 'building', target: 'terminal' },
  present_plan: { activity: 'planning', target: 'agent' },
  update_tasks: { activity: 'planning', target: 'agent' },
  web_search: { activity: 'researching', target: 'agent' },
  deep_research: { activity: 'researching', target: 'agent' },
  ask_user: { activity: 'thinking', target: 'agent' },
  complete: { activity: 'success', target: 'agent' },
}
export function arcyFor(name: string): { activity: ArcyActivity; target: PanelId } {
  return ARCY[name] ?? { activity: 'working', target: 'agent' }
}

// ── Execution ──────────────────────────────────────────────────────────────────
export interface ToolOutcome {
  result: string // fed back to the model
  detail?: string // shown in the action card
  ok: boolean
}

function norm(path: string): string {
  return '/' + String(path).replace(/^\/+/, '')
}

let serverListenerSet = false
function ensureServerListener() {
  if (serverListenerSet) return
  serverListenerSet = true
  void onServerReady(({ url }) => {
    const s = useArc.getState()
    s.setPreviewUrl(url)
    s.setCenterView('preview')
    s.setArcy('success', 'preview')
    window.setTimeout(() => useArc.getState().setArcy('idle', 'agent'), 1600)
  })
}

export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  const s = useArc.getState()
  try {
    switch (name) {
      case 'read_file': {
        const p = norm(args.path as string)
        const content = await readFile(p)
        s.openFile(p)
        // Return the WHOLE file unless it's very large. Silently truncating (the old
        // 8000-char cap) made the model think big files were "corrupted" and it would
        // rewrite them in a loop. Now truncation is explicit and paginated via offset.
        const CAP = 60000
        const offset = Math.max(0, Math.floor(Number(args.offset) || 0))
        const slice = content.slice(offset, offset + CAP)
        const end = offset + slice.length
        const truncated = offset > 0 || end < content.length
        const result = truncated
          ? `[${p} — showing chars ${offset}–${end} of ${content.length}.${end < content.length ? ` Call read_file with offset ${end} for the rest.` : ''}]\n${slice}`
          : slice
        return { result, detail: content.slice(0, 8000), ok: true }
      }
      case 'list_dir': {
        const p = (args.path as string) || '/'
        const entries = await listDir(p === '/' ? '/' : norm(p))
        const list = entries.map((e) => (e.dir ? `${e.name}/` : e.name)).join('\n')
        return { result: list || '(empty)', detail: list, ok: true }
      }
      case 'write_file': {
        const p = norm(args.path as string)
        const content = String(args.content ?? '')
        s.captureBaseline(p, await readFile(p).catch(() => '')) // '' ⇒ brand-new file
        await writeFile(p, content)
        s.bumpTree()
        s.markTouched(p)
        s.openFile(p)
        return { result: `Wrote ${p} (${content.split('\n').length} lines).`, detail: content.slice(0, 8000), ok: true }
      }
      case 'edit_file': {
        const p = norm(args.path as string)
        const search = String(args.search ?? '')
        const replace = String(args.replace ?? '')
        const content = await readFile(p)
        if (!search || !content.includes(search)) {
          return { result: `Could not find the search text in ${p}. Re-read the file and try again.`, ok: false }
        }
        s.captureBaseline(p, content)
        const next = content.replace(search, replace)
        await writeFile(p, next)
        s.bumpTree()
        s.markTouched(p)
        s.openFile(p)
        return { result: `Edited ${p}.`, detail: `- ${search.slice(0, 400)}\n+ ${replace.slice(0, 400)}`, ok: true }
      }
      case 'delete_file': {
        const p = norm(args.path as string)
        await removePath(p)
        s.bumpTree()
        s.closeFile(p)
        return { result: `Deleted ${p}.`, ok: true }
      }
      case 'rename': {
        const from = norm(args.from as string)
        const to = norm(args.to as string)
        await renamePath(from, to)
        s.bumpTree()
        return { result: `Renamed ${from} → ${to}.`, ok: true }
      }
      case 'run_command': {
        const command = String(args.command ?? '').trim()
        if (!command) return { result: 'No command given.', ok: false }
        termWrite(`\r\n\x1b[38;2;204;120;92m⚡ arc \x1b[0m${command}\r\n`)
        const parts = command.split(/\s+/)
        if (parts[0] === 'git') {
          const out = await runGit(parts.slice(1))
          termWrite(out.replace(/\n/g, '\r\n') + '\r\n')
          s.bumpTree()
          return { result: out || '(ok)', detail: out, ok: true }
        }
        const step = await startCommand('jsh', ['-c', command], (c) => termWrite(c))
        s.bumpTree()
        if (step.waiting) {
          return {
            result:
              `${step.output}\n\n⏳ This command is waiting for input. Respond with the send_input tool — e.g. send_input("y{enter}") to confirm, send_input("{enter}") to accept the highlighted default, or {up}/{down} then {enter} to choose a menu item.`.slice(0, 6000),
            detail: step.output.slice(0, 8000),
            ok: true,
          }
        }
        return { result: `exit ${step.exitCode}\n${step.output}`.slice(0, 6000), detail: step.output.slice(0, 8000), ok: step.exitCode === 0 }
      }
      case 'send_input': {
        const step = await sendCommandInput(decodeKeys(String(args.input ?? '')), (c) => termWrite(c))
        s.bumpTree()
        if (step.none) return { result: step.output, ok: false }
        if (step.waiting) {
          return {
            result: `${step.output}\n\n⏳ Still waiting for input — respond again with send_input (send "{enter}" to accept the default).`.slice(0, 6000),
            detail: step.output.slice(0, 8000),
            ok: true,
          }
        }
        return { result: `exit ${step.exitCode}\n${step.output}`.slice(0, 6000), detail: step.output.slice(0, 8000), ok: step.exitCode === 0 }
      }
      case 'start_dev_server': {
        ensureServerListener()
        let command = String(args.command ?? '').trim()
        let injected = false // true only when Arc's static server serves it (console + inspect work)
        if (!command) {
          // Auto-detect: a package.json dev script, else serve the static files directly.
          let hasDev = false
          try {
            const pkg = JSON.parse(await readFile('/package.json')) as { scripts?: Record<string, string> }
            hasDev = !!pkg?.scripts?.dev
          } catch {
            /* no package.json */
          }
          if (hasDev) {
            command = 'npm run dev'
          } else {
            await writeFile('/.arc-static-server.cjs', STATIC_SERVER)
            command = 'node .arc-static-server.cjs'
            injected = true
          }
        }
        s.setPreviewInjected(injected)
        termWrite(`\r\n\x1b[38;2;204;120;92m⚡ arc \x1b[0m${command}\r\n`)
        const proc = await spawnProcess('jsh', ['-c', command])
        void proc.output.pipeTo(new WritableStream<string>({ write: (c) => termWrite(c) })).catch(() => {})
        return { result: 'Dev server starting — the preview opens automatically once it is ready.', detail: `$ ${command}`, ok: true }
      }
      case 'present_plan': {
        const title = String(args.title ?? 'Plan')
        const steps = Array.isArray(args.steps) ? (args.steps as unknown[]).map(String) : []
        s.pushTimeline({ kind: 'plan', title, steps, status: 'pending' })
        return { result: 'Plan shown to the user.', ok: true }
      }
      case 'update_tasks': {
        const raw = Array.isArray(args.tasks) ? (args.tasks as Array<{ text?: string; status?: string }>) : []
        const tasks = raw
          .filter((t) => t && t.text)
          .map((t, i) => ({
            id: `task-${i}`,
            text: String(t.text),
            status: (t.status === 'active' || t.status === 'done' ? t.status : 'pending') as 'pending' | 'active' | 'done',
          }))
        s.setTasks(tasks)
        return { result: `Updated ${tasks.length} task(s).`, ok: true }
      }
      case 'web_search': {
        const out = await webSearch(String(args.query ?? ''))
        return { result: out.slice(0, 6000), detail: out.slice(0, 4000), ok: true }
      }
      case 'deep_research': {
        const out = await deepResearch(String(args.query ?? ''))
        return { result: out.slice(0, 8000), detail: out.slice(0, 4000), ok: true }
      }
      case 'ask_user': {
        const q = String(args.question ?? '')
        if (!q) return { result: 'No question provided.', ok: false }
        const options = Array.isArray(args.options) ? (args.options as unknown[]).map(String) : []
        const answer = await askUser(q, options)
        return { result: `The user answered: ${answer}`, ok: true }
      }
      case 'complete': {
        return { result: 'Build marked complete.', detail: String(args.summary ?? ''), ok: true }
      }
      default:
        return { result: `Unknown tool: ${name}`, ok: false }
    }
  } catch (e) {
    const msg = (e as { userMessage?: string })?.userMessage ?? (e instanceof Error ? e.message : String(e))
    return { result: `Tool error: ${msg}`, detail: msg, ok: false }
  }
}

/** Parse a tool-call arguments string into an object (tolerant). */
export function parseArgs(argsJson: string): Record<string, unknown> {
  const parsed = parseLooseJson(argsJson)
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
}
