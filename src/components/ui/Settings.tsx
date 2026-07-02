import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useArc } from '../../store/arc'
import type { ArcModelId } from '../../config/providers'
import type { AgentMode } from '../../config/prompts'
import { EFFORT_ORDER, EFFORTS, type EffortLevel } from '../../services/effort'
import { listProjects, deleteProject } from '../../services/persistence'
import { readFile, writeFile } from '../../services/webcontainer'

const FONT_SIZES = [
  { label: 'S', value: 12 },
  { label: 'M', value: 13 },
  { label: 'L', value: 15 },
  { label: 'XL', value: 17 },
]

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-[13px] text-body">{label}</span>
      <div className="flex flex-wrap justify-end gap-1.5">{children}</div>
    </div>
  )
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-[12px] transition ${
        active ? 'border-accent bg-accent-soft text-ink' : 'border-hairline text-body hover:border-hairline-strong hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

export function Settings() {
  const open = useArc((s) => s.settingsOpen)
  const setSettings = useArc((s) => s.setSettings)
  const effort = useArc((s) => s.effort)
  const setEffort = useArc((s) => s.setEffort)
  const mode = useArc((s) => s.mode)
  const setMode = useArc((s) => s.setMode)
  const override = useArc((s) => s.override)
  const setOverride = useArc((s) => s.setOverride)
  const theme = useArc((s) => s.theme)
  const toggleTheme = useArc((s) => s.toggleTheme)
  const fontSize = useArc((s) => s.fontSize)
  const setFontSize = useArc((s) => s.setFontSize)

  const [token, setToken] = useState('')
  const [projCount, setProjCount] = useState(0)
  const [cleared, setCleared] = useState(false)

  useEffect(() => {
    if (!open) return
    setToken(localStorage.getItem('arc-github-token') ?? '')
    listProjects().then((p) => setProjCount(p.length))
  }, [open])

  const clearProjects = async () => {
    const ps = await listProjects()
    await Promise.all(ps.map((p) => deleteProject(p.id)))
    setProjCount(0)
  }

  const clearHistory = () => {
    useArc.getState().clearTimeline()
    setCleared(true)
    setTimeout(() => setCleared(false), 1500)
  }

  const editRules = async () => {
    const path = '/Arc.md'
    try {
      // Inner: create the file if it doesn't exist. Outer: handle the container being unavailable.
      try {
        await readFile(path)
      } catch {
        await writeFile(path, '# Project rules\n\nArc follows these guidelines for this project:\n\n- \n')
      }
    } catch {
      useArc.getState().setToast('Could not open project rules — the workspace engine is unavailable here.')
      return
    }
    const s = useArc.getState()
    s.setView('workspace') // make the editor visible even when opened from the launch screen
    s.openFile(path)
    s.bumpTree()
    setSettings(false)
  }

  const setTheme = (t: 'dark' | 'light') => {
    if (theme !== t) toggleTheme()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/30 px-4 backdrop-blur-sm"
          onClick={() => setSettings(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-hairline-strong bg-canvas shadow-[0_24px_70px_rgba(20,20,19,0.3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
              <h2 className="font-display text-xl tracking-tight">Settings</h2>
              <button onClick={() => setSettings(false)} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink">
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto px-5 py-2">
              <p className="eyebrow mt-2">Appearance</p>
              <Row label="Theme">
                <Seg active={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</Seg>
                <Seg active={theme === 'light'} onClick={() => setTheme('light')}>Light</Seg>
              </Row>
              <Row label="Editor font size">
                {FONT_SIZES.map((f) => (
                  <Seg key={f.value} active={fontSize === f.value} onClick={() => setFontSize(f.value)}>
                    {f.label}
                  </Seg>
                ))}
              </Row>

              <div className="my-2 h-px bg-hairline" />
              <p className="eyebrow mt-2">Defaults</p>
              <Row label="Effort">
                {EFFORT_ORDER.map((e) => (
                  <Seg key={e} active={effort === e} onClick={() => setEffort(e as EffortLevel)}>
                    {EFFORTS[e].label}
                  </Seg>
                ))}
              </Row>
              <Row label="Mode">
                {(['build', 'ask', 'plan'] as AgentMode[]).map((m) => (
                  <Seg key={m} active={mode === m} onClick={() => setMode(m)}>
                    <span className="capitalize">{m}</span>
                  </Seg>
                ))}
              </Row>
              <Row label="Model">
                <Seg active={override === 'arc3mini'} onClick={() => setOverride('arc3mini' as ArcModelId)}>Arc3Mini</Seg>
                <Seg active={override === 'arc3ultra'} onClick={() => setOverride('arc3ultra' as ArcModelId)}>Arc3Ultra</Seg>
                <Seg active={override === null} onClick={() => setOverride(null)}>Ask each time</Seg>
              </Row>

              <div className="my-2 h-px bg-hairline" />
              <p className="eyebrow mt-2">Project</p>
              <Row label="Project rules (Arc.md)">
                <Seg active={false} onClick={editRules}>Edit</Seg>
              </Row>
              <Row label="Chat history">
                <Seg active={false} onClick={clearHistory}>{cleared ? 'Cleared ✓' : 'Clear'}</Seg>
              </Row>

              <div className="my-2 h-px bg-hairline" />
              <p className="eyebrow mt-2">Data</p>
              <Row label={`Saved projects · ${projCount}`}>
                <Seg active={false} onClick={clearProjects}>Clear all</Seg>
              </Row>

              <div className="my-2 h-px bg-hairline" />
              <p className="eyebrow mt-2">GitHub</p>
              <div className="py-2">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value)
                    localStorage.setItem('arc-github-token', e.target.value)
                  }}
                  placeholder="Personal access token (for push)"
                  className="w-full rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent/60"
                />
                <p className="mt-1.5 text-[11px] text-muted">Stored locally in your browser. Used only when you push a project to GitHub.</p>
              </div>

              <div className="my-2 h-px bg-hairline" />
              <p className="eyebrow mt-2">Shortcuts</p>
              <div className="py-1 font-mono text-[11.5px] text-muted">
                {[
                  ['Command palette', '⌘/Ctrl K'],
                  ['Send message', 'Enter'],
                  ['New line', 'Shift Enter'],
                  ['Reference a file', '@'],
                  ['Close dialog', 'Esc'],
                ].map(([label, keys]) => (
                  <div key={label} className="flex items-center justify-between py-0.5">
                    <span>{label}</span>
                    <kbd className="rounded bg-surface-2 px-1.5 py-0.5 text-ink">{keys}</kbd>
                  </div>
                ))}
              </div>

              <div className="my-2 h-px bg-hairline" />
              <p className="py-3 text-center text-[12px] text-muted">
                <span className="font-display text-sm text-ink">Arc Coder</span> — by Arc Labs
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
