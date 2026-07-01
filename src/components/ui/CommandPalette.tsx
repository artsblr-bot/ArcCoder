import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, CornerDownLeft } from 'lucide-react'
import { useArc } from '../../store/arc'
import { EFFORT_ORDER, EFFORTS } from '../../services/effort'

interface Cmd {
  label: string
  hint?: string
  run: () => void
}

export function CommandPalette() {
  const open = useArc((s) => s.paletteOpen)
  const setPalette = useArc((s) => s.setPalette)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const commands = useMemo<Cmd[]>(() => {
    const s = useArc.getState()
    const list: Cmd[] = [
      { label: 'Go to home', hint: 'Launch screen', run: () => s.setView('launch') },
      { label: 'Projects', hint: 'All saved projects', run: () => s.setView('projects') },
      { label: 'New project', hint: 'Start fresh', run: () => { s.newProject(); s.setView('launch') } },
      { label: 'Open settings', run: () => s.setSettings(true) },
      { label: 'Show editor', run: () => s.setCenterView('editor') },
      { label: 'Show preview', run: () => s.setCenterView('preview') },
      { label: 'Show blueprint', run: () => s.setCenterView('blueprint') },
      { label: 'Model: Arc3Mini', hint: 'Fast', run: () => s.setOverride('arc3mini') },
      { label: 'Model: Arc3Ultra', hint: 'Deep', run: () => s.setOverride('arc3ultra') },
      { label: 'Mode: Build', run: () => s.setMode('build') },
      { label: 'Mode: Ask', run: () => s.setMode('ask') },
      { label: 'Mode: Plan', run: () => s.setMode('plan') },
      ...EFFORT_ORDER.map((e) => ({ label: `Effort: ${EFFORTS[e].label}`, hint: EFFORTS[e].supercode ? 'Top gear' : undefined, run: () => s.setEffort(e) })),
    ]
    return list
  }, [])

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()))

  const exec = (c: Cmd) => {
    c.run()
    setPalette(false)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/30 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setPalette(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-hairline-strong bg-canvas shadow-[0_24px_70px_rgba(20,20,19,0.3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
              <Search size={15} className="text-muted" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filtered[0]) exec(filtered[0])
                  if (e.key === 'Escape') setPalette(false)
                }}
                placeholder="Type a command…"
                className="flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
              />
            </div>
            <div className="max-h-80 overflow-auto p-1.5">
              {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">No matching commands</p>}
              {filtered.map((c) => (
                <button
                  key={c.label}
                  onClick={() => exec(c)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-surface-2"
                >
                  <span className="flex-1 text-[14px] text-ink">{c.label}</span>
                  {c.hint && <span className="text-[12px] text-muted">{c.hint}</span>}
                  <CornerDownLeft size={12} className="text-faint" />
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
