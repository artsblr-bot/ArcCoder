import { useEffect, useRef, useState } from 'react'
import { Send, Square, Paperclip, X, Hammer, MessageCircleQuestion, ClipboardList, Cpu, Gauge, File as FileIcon } from 'lucide-react'
import { useArc } from '../../store/arc'
import { ARC_MODELS, HAS_VISION } from '../../config/providers'
import type { ArcModelId } from '../../config/providers'
import type { AgentMode } from '../../config/prompts'
import { runTurn, stopTurn } from '../../services/agentLoop'
import { scheduleSave } from '../../services/persistence'
import { effortConfig, type EffortLevel } from '../../services/effort'
import { readFile, readProjectFiles } from '../../services/webcontainer'
import { Menu, type MenuOption } from '../ui/Menu'

const MODEL_OPTS: MenuOption[] = [
  { value: 'arc3mini', label: 'Arc3Mini', hint: 'Fast — quick edits, answers, small changes' },
  { value: 'arc3ultra', label: 'Arc3Ultra', hint: 'Deep — big builds, refactors, hard problems' },
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
  const override = useArc((s) => s.override)
  const setOverride = useArc((s) => s.setOverride)
  const setPendingPrompt = useArc((s) => s.setPendingPrompt)
  const mode = useArc((s) => s.mode)
  const setMode = useArc((s) => s.setMode)
  const effort = useArc((s) => s.effort)
  const setEffort = useArc((s) => s.setEffort)
  const status = useArc((s) => s.status)
  const treeVersion = useArc((s) => s.treeVersion)
  const running = status === 'thinking' || status === 'working'
  const fileRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // @-mention state: the file list + the token currently being typed after "@".
  const [allFiles, setAllFiles] = useState<string[]>([])
  const [mention, setMention] = useState<{ query: string; start: number; caret: number } | null>(null)
  const [mIndex, setMIndex] = useState(0)

  useEffect(() => {
    readProjectFiles()
      .then((f) => setAllFiles(Object.keys(f)))
      .catch(() => setAllFiles([]))
  }, [treeVersion])

  const matches = mention
    ? allFiles.filter((p) => p.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 8)
    : []

  const setText = (v: string) => {
    setDraft(v)
    scheduleSave() // persist the in-progress draft (debounced)
  }

  // Detect a "@query" being typed right before the caret so we can offer file matches.
  const syncMention = (value: string, caret: number) => {
    const m = value.slice(0, caret).match(/(?:^|\s)@([^\s@]*)$/)
    if (m) {
      setMention({ query: m[1], start: caret - m[1].length - 1, caret })
      setMIndex(0)
    } else setMention(null)
  }

  const pickMention = (path: string) => {
    if (!mention) return
    // Replace the whole @token (up to its end), not just up to the caret, and drop a
    // duplicate following space so editing mid-token doesn't leave a dangling tail.
    const tail = text.slice(mention.caret).match(/^[^\s@]*/)?.[0] ?? ''
    const tokenEnd = mention.caret + tail.length
    const insert = `@${path} `
    let rest = text.slice(tokenEnd)
    if (rest.startsWith(' ')) rest = rest.slice(1)
    const next = `${text.slice(0, mention.start)}${insert}${rest}`
    setText(next)
    setMention(null)
    const pos = mention.start + insert.length
    requestAnimationFrame(() => {
      taRef.current?.focus()
      taRef.current?.setSelectionRange(pos, pos)
    })
  }

  // Pull the contents of any @-referenced files so the model sees them directly.
  const expandMentions = async (t: string): Promise<string> => {
    const paths = Array.from(new Set((t.match(/@([^\s@]+)/g) || []).map((m) => m.slice(1).replace(/[.,;:!?)\]}'"]+$/, ''))))
    const parts: string[] = []
    for (const p of paths) {
      try {
        const c = await readFile('/' + p.replace(/^\/+/, ''))
        parts.push(`--- @${p} ---\n${c.slice(0, 12000)}`)
      } catch {
        /* not a real file — the model can ignore the token */
      }
    }
    return parts.length ? `Referenced files (contents provided for context):\n\n${parts.join('\n\n')}` : ''
  }

  const submit = async () => {
    if (!text.trim() || running) return
    const message = text
    const imgs = images
    setDraft('')
    setImages([])
    setMention(null)
    scheduleSave()
    const attachments = await expandMentions(message)
    // No model chosen yet — pop the picker first, then run once the user decides.
    if (!override) {
      setPendingPrompt({ text: message, images: imgs, attachments })
      return
    }
    void runTurn(message, imgs, attachments)
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

      <div className="relative rounded-xl border border-hairline bg-canvas transition focus-within:border-accent/50">
        {mention && matches.length > 0 && (
          <div className="absolute bottom-full left-2 z-20 mb-1 w-72 overflow-hidden rounded-lg border border-hairline bg-surface-1 py-1 shadow-xl">
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted">Reference a file</div>
            {matches.map((p, i) => (
              <button
                key={p}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pickMention(p)
                }}
                onMouseEnter={() => setMIndex(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] ${i === mIndex ? 'bg-accent-soft text-ink' : 'text-body hover:bg-surface-2'}`}
              >
                <FileIcon size={12} className="shrink-0 text-muted" />
                <span className="truncate">{p}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            syncMention(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }}
          onClick={(e) => syncMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (mention && matches.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setMIndex((i) => (i + 1) % matches.length)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setMIndex((i) => (i - 1 + matches.length) % matches.length)
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                pickMention(matches[mIndex])
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setMention(null)
                return
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
          rows={2}
          placeholder="Describe what to build, fix, or change…  Use @ to reference a file."
          className="w-full resize-none bg-transparent px-3.5 py-3 text-[14px] leading-relaxed text-ink outline-none placeholder:text-muted"
        />
        <div className="flex items-center justify-end gap-1.5 px-2 pb-2">
          {/* Image attach only appears when a vision-capable model is configured
              (none right now — m2.7 and GLM are text-only). Auto-returns if one is. */}
          {HAS_VISION && (
            <>
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
            </>
          )}
          {running ? (
            <button onClick={stopTurn} className="flex items-center gap-1.5 rounded-lg bg-danger/15 px-3 py-2 text-[13px] font-medium text-danger transition hover:bg-danger/25">
              <Square size={14} /> Stop
            </button>
          ) : (
            <button
              onClick={() => void submit()}
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
          value={override ?? ''}
          options={MODEL_OPTS}
          onChange={(v) => setOverride(v as ArcModelId)}
          trigger={
            <span className="flex items-center gap-1.5">
              <Cpu size={13} className="text-accent" />
              {override ? ARC_MODELS[override].label : 'Select model'}
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
