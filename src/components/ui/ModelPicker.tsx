import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Zap, Sparkles, ImageIcon, X } from 'lucide-react'
import { useArc } from '../../store/arc'
import { ARC_MODELS, type ArcModelId } from '../../config/providers'
import { runTurn } from '../../services/agentLoop'

const CARDS: { id: ArcModelId; tag: string; icon: typeof Zap; note?: string }[] = [
  { id: 'arc3mini', tag: 'Fast', icon: Zap },
  { id: 'arc3ultra', tag: 'Deep', icon: Sparkles, note: 'Understands images' },
]

/**
 * The first prompt of a project pauses here so the user makes a deliberate model
 * choice instead of silently defaulting to one. Once picked, `override` is set and
 * the queued prompt runs; the choice sticks for the rest of the project (switchable
 * anytime from the composer). Cancelling returns the text to the composer.
 */
export function ModelPicker() {
  const pending = useArc((s) => s.pendingPrompt)
  const setPendingPrompt = useArc((s) => s.setPendingPrompt)
  const setOverride = useArc((s) => s.setOverride)
  const setDraft = useArc((s) => s.setDraft)

  const pick = (id: ArcModelId) => {
    if (!pending) return
    const p = pending
    setOverride(id)
    setPendingPrompt(null)
    // The user-interaction delay is plenty; a tick lets the modal unmount cleanly first.
    window.setTimeout(() => void runTurn(p.text, p.images, p.attachments), 20)
  }

  const cancel = () => {
    if (pending) setDraft(pending.text) // don't lose what they typed
    setPendingPrompt(null)
  }

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 px-4 backdrop-blur-sm"
          onClick={cancel}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-hairline-strong bg-canvas shadow-[0_28px_80px_rgba(20,20,19,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-hairline px-6 py-4">
              <div>
                <p className="eyebrow">Choose your model</p>
                <h2 className="mt-1 font-display text-2xl leading-tight tracking-tight">Who should build this?</h2>
              </div>
              <button onClick={cancel} className="rounded-md p-1 text-muted transition hover:bg-surface-2 hover:text-ink" title="Cancel">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 pt-4">
              <div className="truncate rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-[12.5px] text-body">
                <span className="text-muted">Building&nbsp;·&nbsp;</span>
                {pending.text}
              </div>
            </div>

            <div className="grid gap-3 p-6 sm:grid-cols-2">
              {CARDS.map(({ id, tag, icon: Icon, note }) => {
                const m = ARC_MODELS[id]
                return (
                  <button
                    key={id}
                    onClick={() => pick(id)}
                    className="group flex flex-col gap-2 rounded-xl border border-hairline bg-surface-1 p-4 text-left transition hover:border-accent hover:bg-accent-soft focus:border-accent focus:outline-none"
                  >
                    <div className="flex items-center justify-between">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-accent transition group-hover:bg-accent group-hover:text-white">
                        <Icon size={17} />
                      </span>
                      <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">{tag}</span>
                    </div>
                    <span className="font-display text-lg tracking-tight text-ink">{m.label}</span>
                    <span className="text-[12.5px] leading-relaxed text-body">{m.blurb}</span>
                    <span className="mt-1 flex items-center gap-3 text-[11px] text-muted">
                      <span>{m.contextLabel} context</span>
                      {note && (
                        <span className="flex items-center gap-1">
                          <ImageIcon size={11} /> {note}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>

            <p className="border-t border-hairline px-6 py-3 text-center text-[11.5px] text-muted">
              You can switch models anytime from the composer.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
