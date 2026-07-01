import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Brain, Check, Loader2, AlertTriangle, FileEdit, TerminalSquare, Search, ListChecks, Sparkles, ChevronRight, Wrench } from 'lucide-react'
import { useArc, type TimelineItem } from '../../store/arc'
import { runTurn, isRunning } from '../../services/agentLoop'

function FixButton({ context }: { context: string }) {
  return (
    <button
      onClick={() => {
        if (!isRunning()) void runTurn(`Something went wrong — please diagnose and fix it.\n\n${context}`)
      }}
      className="flex items-center gap-1.5 self-start rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white transition hover:bg-accent-strong"
    >
      <Wrench size={12} /> Fix with Arc
    </button>
  )
}

function toolIcon(tool: string) {
  if (/write|edit|file|rename|delete/.test(tool)) return FileEdit
  if (/run|command|terminal|dev|install|build/.test(tool)) return TerminalSquare
  if (/search|research|web/.test(tool)) return Search
  if (/plan|task/.test(tool)) return ListChecks
  return Sparkles
}

function Reasoning({ item }: { item: Extract<TimelineItem, { kind: 'reasoning' }> }) {
  const [open, setOpen] = useState(true)
  if (!item.text.trim()) return null
  return (
    <div className="w-full rounded-lg border-l-2 border-accent/50 bg-surface-2/60 px-3 py-2">
      <button onClick={() => setOpen((o) => !o)} className="mb-1 flex w-full items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
        <Brain size={12} /> Thinking {!item.done && <span className="animate-pulse text-accent">●</span>}
        <ChevronRight size={12} className={`ml-auto transition ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <p className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-muted">
          {item.text}
          {!item.done && <span className="arc-blink text-accent">▌</span>}
        </p>
      )}
    </div>
  )
}

function ActionCard({ item }: { item: Extract<TimelineItem, { kind: 'action' }> }) {
  const [open, setOpen] = useState(false)
  const streamFile = useArc((s) => s.streamFile)
  const bodyRef = useRef<HTMLPreElement>(null)
  const Icon = toolIcon(item.tool)
  const running = item.status === 'running'

  // While the call is streaming/executing, show its body live: a file write mirrors
  // the editor's word-by-word stream; other tools show their command/query as it types.
  const live =
    running && item.tool === 'write_file' && item.path && streamFile?.path === item.path
      ? streamFile.content
      : running && item.detail
        ? item.detail
        : null

  // Keep the newest text in view as it types out.
  useEffect(() => {
    if (live != null && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [live])

  const hasDetail = !!item.detail || live != null
  return (
    <div className="w-full rounded-lg border border-hairline bg-surface-2/60">
      <button onClick={() => hasDetail && setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]">
        <Icon size={14} className="shrink-0 text-accent" />
        <span className="flex-1 truncate text-body">{item.title}</span>
        {item.status === 'running' && <Loader2 size={13} className="animate-spin text-muted" />}
        {item.status === 'done' && <Check size={13} className="text-success" />}
        {item.status === 'error' && <AlertTriangle size={13} className="text-danger" />}
        {hasDetail && !live && <ChevronRight size={13} className={`text-muted transition ${open ? 'rotate-90' : ''}`} />}
      </button>
      {item.status === 'running' && <div className="arc-shimmer h-0.5 w-full" />}
      {live != null && live !== '' && (
        <pre ref={bodyRef} className="max-h-56 overflow-auto border-t border-hairline px-3 py-2 font-mono text-[11px] leading-relaxed text-body">
          {live}
          <span className="arc-blink text-accent">▌</span>
        </pre>
      )}
      {open && item.detail && live == null && (
        <pre className="max-h-56 overflow-auto border-t border-hairline px-3 py-2 font-mono text-[11px] leading-relaxed text-muted">{item.detail}</pre>
      )}
      {item.status === 'error' && (
        <div className="border-t border-hairline px-3 py-2">
          <FixButton context={`${item.title}\n${item.detail ?? ''}`} />
        </div>
      )}
    </div>
  )
}

function PlanCard({ item }: { item: Extract<TimelineItem, { kind: 'plan' }> }) {
  const updateTimeline = useArc((s) => s.updateTimeline)
  const setCenterView = useArc((s) => s.setCenterView)
  return (
    <div className="w-full rounded-xl border border-accent/30 bg-accent-soft/40 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
        <ListChecks size={14} className="text-accent" /> {item.title}
      </div>
      <ol className="mb-2 space-y-1">
        {item.steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-[12.5px] text-body">
            <span className="font-mono text-muted">{i + 1}.</span> {s}
          </li>
        ))}
      </ol>
      {item.status === 'pending' ? (
        <button
          onClick={() => {
            updateTimeline(item.id, { status: 'approved' })
            setCenterView('blueprint')
          }}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong"
        >
          Approve & build
        </button>
      ) : (
        <span className="text-xs text-success">✓ Approved</span>
      )}
    </div>
  )
}

function render(it: TimelineItem, live: boolean) {
  switch (it.kind) {
    case 'user':
      return <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-accent-soft px-3.5 py-2 text-sm text-ink">{it.text}</div>
    case 'reasoning':
      return <Reasoning item={it} />
    case 'assistant':
      return it.text.trim() ? (
        <div className="max-w-[94%] whitespace-pre-wrap text-sm leading-relaxed text-body">
          {it.text}
          {live && <span className="arc-blink text-accent">▌</span>}
        </div>
      ) : null
    case 'action':
      return <ActionCard item={it} />
    case 'plan':
      return <PlanCard item={it} />
    case 'switch':
      return <div className="mx-auto rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-xs text-accent">{it.text}</div>
    case 'error':
      return (
        <div className="flex w-full flex-col gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          <span className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span className="whitespace-pre-wrap">{it.text}</span>
          </span>
          <FixButton context={it.text} />
        </div>
      )
  }
}

export function Timeline() {
  const items = useArc((s) => s.timeline)
  const status = useArc((s) => s.status)
  const running = status === 'thinking' || status === 'working'
  if (items.length === 0)
    return <p className="px-1 text-sm text-muted">Ask Arc to build something, fix a bug, or explain code. It works right here in your browser.</p>
  return (
    <div className="flex flex-col gap-3">
      {items.map((it, idx) => {
        const node = render(it, running && idx === items.length - 1)
        if (!node) return null
        return (
          <motion.div key={it.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex">
            {node}
          </motion.div>
        )
      })}
    </div>
  )
}
