import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Circle, HelpCircle } from 'lucide-react'
import { useArc } from '../../store/arc'
import { ARC_MODELS } from '../../config/providers'
import { Timeline } from './Timeline'
import { Composer } from './Composer'
import { registerPanel } from '../mascot/panelRegistry'
import { submitAnswer } from '../../services/askUser'
import { WORDS, SENTENCES } from '../../data/loading'

const BRAILLE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
function Spinner() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % BRAILLE.length), 80)
    return () => clearInterval(id)
  }, [])
  return <span className="font-mono text-[15px] text-accent">{BRAILLE[i]}</span>
}

// Alternates between a single whimsical WORD and a flavor SENTENCE — one at a time.
function AltCycler() {
  const word = () => WORDS[Math.floor(Math.random() * WORDS.length)] + '…'
  const sentence = () => SENTENCES[Math.floor(Math.random() * SENTENCES.length)]
  const [text, setText] = useState(word)
  const showSentence = useRef(false)
  useEffect(() => {
    const id = setInterval(() => {
      showSentence.current = !showSentence.current
      setText(showSentence.current ? sentence() : word())
    }, 1900)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <span key={text} className="arc-rise text-muted">
      {text}
    </span>
  )
}

function ThinkingIndicator() {
  const status = useArc((s) => s.status)
  const pending = useArc((s) => s.pendingQuestion)
  const running = status === 'thinking' || status === 'working'
  const [sec, setSec] = useState(0)

  useEffect(() => {
    if (!running) {
      setSec(0)
      return
    }
    const t0 = Date.now()
    const id = setInterval(() => setSec(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(id)
  }, [running])

  if (!running || pending) return null
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-lg border border-hairline bg-surface-2/60 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <Spinner />
        <span className="text-[13px] text-body">Arc is {status === 'working' ? 'Working' : 'Thinking'}</span>
        {sec > 2 && <span className="ml-auto font-mono text-[11px] text-muted">{sec}s</span>}
      </div>
      <div className="mt-1.5 pl-[26px] text-[12px]">
        <AltCycler />
      </div>
    </motion.div>
  )
}

function QuestionCard() {
  const q = useArc((s) => s.pendingQuestion)
  const [text, setText] = useState('')
  useEffect(() => setText(''), [q?.id])
  if (!q) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 rounded-xl border border-accent/40 bg-accent-soft/50 p-3"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
        <HelpCircle size={14} className="text-accent" /> Arc needs your input
      </div>
      <p className="mb-2.5 whitespace-pre-wrap text-[13.5px] text-body">{q.question}</p>
      {q.options.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {q.options.map((o) => (
            <button
              key={o}
              onClick={() => submitAnswer(o)}
              className="rounded-lg border border-hairline bg-surface-1 px-3 py-1.5 text-[13px] text-body transition hover:border-accent hover:text-ink"
            >
              {o}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && text.trim() && submitAnswer(text)}
          placeholder="Type your answer…"
          className="flex-1 rounded-lg border border-hairline bg-canvas px-3 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
        />
        <button
          onClick={() => text.trim() && submitAnswer(text)}
          className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-accent-strong"
        >
          Send
        </button>
      </div>
    </motion.div>
  )
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)
}

function StatusPill() {
  const status = useArc((s) => s.status)
  const map = {
    idle: { text: 'Ready', cls: 'text-muted', dot: 'bg-muted' },
    thinking: { text: 'Thinking', cls: 'text-accent', dot: 'bg-accent animate-pulse' },
    working: { text: 'Working', cls: 'text-accent', dot: 'bg-accent animate-pulse' },
    error: { text: 'Error', cls: 'text-danger', dot: 'bg-danger' },
  }[status]
  return (
    <span className={`flex items-center gap-1.5 text-[11px] ${map.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${map.dot}`} />
      {map.text}
    </span>
  )
}

function Tasks() {
  const tasks = useArc((s) => s.tasks)
  if (tasks.length === 0) return null
  const done = tasks.filter((t) => t.status === 'done').length
  return (
    <div className="border-b border-hairline px-3.5 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="eyebrow">Tasks</span>
        <span className="font-mono text-[11px] text-muted">
          {done}/{tasks.length}
        </span>
      </div>
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-[12.5px]">
            {t.status === 'done' ? (
              <Check size={12} className="shrink-0 text-success" />
            ) : t.status === 'active' ? (
              <Circle size={9} className="shrink-0 animate-pulse fill-accent text-accent" />
            ) : (
              <Circle size={9} className="shrink-0 text-faint" />
            )}
            <span className={t.status === 'done' ? 'text-muted line-through' : 'text-body'}>{t.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ContextBar() {
  const tokens = useArc((s) => s.contextTokens)
  const model = useArc((s) => s.model)
  const m = ARC_MODELS[model]
  const pct = Math.min(100, (tokens / m.contextWindow) * 100)
  const color = pct < 60 ? 'bg-accent' : pct < 85 ? 'bg-warning' : 'bg-danger'
  return (
    <div className="px-3.5 pt-2.5">
      <div className="mb-1 flex justify-between font-mono text-[10px] text-muted">
        <span className="tracking-wider uppercase">Context</span>
        <span>
          {fmt(tokens)} / {m.contextLabel}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-3">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  )
}

export function AgentPanel() {
  const ref = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const timeline = useArc((s) => s.timeline)

  useEffect(() => {
    registerPanel('agent', ref.current)
    return () => registerPanel('agent', null)
  }, [])
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [timeline])

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col bg-surface-1">
      <header className="flex items-center justify-between border-b border-hairline px-3.5 py-3">
        <span className="eyebrow">Agent</span>
        <StatusPill />
      </header>
      <Tasks />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-3.5 py-4">
        <Timeline />
        <QuestionCard />
        <ThinkingIndicator />
      </div>
      <ContextBar />
      <Composer />
    </div>
  )
}
