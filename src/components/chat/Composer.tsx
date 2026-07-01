import { useRef, useState } from 'react'
import { Send, Square, Paperclip, X, Hammer, MessageCircleQuestion, ClipboardList, Cpu, Gauge } from 'lucide-react'
import { useArc } from '../../store/arc'
import { ARC_MODELS } from '../../config/providers'
import type { ArcModelId } from '../../config/providers'
import type { AgentMode } from '../../config/prompts'
import { runTurn, stopTurn } from '../../services/agentLoop'
import { scheduleSave } from '../../services/persistence'
import { effortConfig, type EffortLevel } from '../../services/effort'
import { Menu, type MenuOption } from '../ui/Menu'

const MODEL_OPTS: MenuOption[] = [
  { value: 'arc3mini', label: 'Arc3Mini', hint: 'Fast — quick edits, answers, small changes' },
  { value: 'arc3ultra', label: 'Arc3Ultra', hint: 'Deep — big builds, refactors, long context' },
]
const MODE_OPTS: MenuOption[] = [
  { value: 'build', label: 'Build', hint: 'Arc edits files and runs commands' },
  { value: 'ask', label: 'Ask', hint: 'Read-only — explains, never changes anything' },
  { value: 'plan', label: 'Plan', hint: 'Proposes a plan for you to approve first' },
]
const EFFORT_OPTS: MenuOption[] = [
  { value: 'low', label: 'Low', hint: 'Quick and direct, minimal steps' },
  { value: 'medium', label: 'Medium', hint: 'Plans briefly before acting' },
  { value: 'high', label: 'High', hint: 'Plans, self-reviews, and verifies' },
  { value: 'max', label: 'Max', hint: 'Thorough planning + multiple review passes' },
  { value: 'supercode', label: 'SUPERCODE', hint: 'Spec → candidates → build/test/fix → critic', badge: 'top' },
]
const MODE_ICON = { build: Hammer, ask: MessageCircleQuestion, plan: ClipboardList }

function toDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export function Composer() {
  const text = useArc((s) => s.draft)
  const setDraft = useArc((s) => s.setDraft)
  const [images, setImages] = useState<string[]>([])
  const model = useArc((s) => s.model)
  const override = useArc((s) => s.override)
  const setOverride = useArc((s) => s.setOverride)
  const mode = useArc((s) => s.mode)
  const setMode = useArc((s) => s.setMode)
  const effort = useArc((s) => s.effort)
  const setEffort = useArc((s) => s.setEffort)
  const status = useArc((s) => s.status)
  const running = status === 'thinking' || status === 'working'
  const fileRef = useRef<HTMLInputElement>(null)

  const setText = (v: string) => {
    setDraft(v)
    scheduleSave() // persist the in-progress draft (debounced)
  }

  const submit = () => {
    if (!text.trim() || running) return
    void runTurn(text, images)
    setDraft('')
    setImages([])
    scheduleSave()
  }

  const ModeIcon = MODE_ICON[mode]

  return (
    <div className="space-y-2.5 border-t border-hairline bg-surface-1 px-3 pb-3 pt-2.5">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((u, i) => (
            <div key={i} className="relative">
              <img src={u} alt="" className="h-11 w-11 rounded-lg object-cover ring-1 ring-hairline" />
              <button
                onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-surface-3 p-0.5 text-muted hover:text-ink"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-hairline bg-canvas transition focus-within:border-accent/50">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={2}
          placeholder="Describe what to build, fix, or change…"
          className="w-full resize-none bg-transparent px-3.5 py-3 text-[14px] leading-relaxed text-ink outline-none placeholder:text-muted"
        />
        <div className="flex items-center justify-end gap-1.5 px-2 pb-2">
          <button onClick={() => fileRef.current?.click()} className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-ink" title="Attach an image">
            <Paperclip size={16} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              void Promise.all(files.map(toDataURL)).then((urls) => setImages((p) => [...p, ...urls]))
              e.target.value = ''
            }}
          />
          {running ? (
            <button onClick={stopTurn} className="flex items-center gap-1.5 rounded-lg bg-danger/15 px-3 py-2 text-[13px] font-medium text-danger transition hover:bg-danger/25">
              <Square size={14} /> Stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send <Send size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Menu
          value={override ?? model}
          options={MODEL_OPTS}
          onChange={(v) => setOverride(v as ArcModelId)}
          trigger={
            <span className="flex items-center gap-1.5">
              <Cpu size={13} className="text-accent" />
              {ARC_MODELS[override ?? model].label}
            </span>
          }
        />
        <Menu
          value={mode}
          options={MODE_OPTS}
          onChange={(v) => setMode(v as AgentMode)}
          width={232}
          trigger={
            <span className="flex items-center gap-1.5 capitalize">
              <ModeIcon size={13} className="text-accent" />
              {mode}
            </span>
          }
        />
        <Menu
          value={effort}
          options={EFFORT_OPTS}
          onChange={(v) => setEffort(v as EffortLevel)}
          width={252}
          trigger={
            <span className="flex items-center gap-1.5">
              <Gauge size={13} className="text-accent" />
              {effortConfig(effort).label}
            </span>
          }
        />
      </div>
    </div>
  )
}
