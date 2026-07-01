import { useEffect, useState } from 'react'
import { ArrowUp, FolderOpen } from 'lucide-react'
import { ArcMark } from '../ui/ArcMark'
import { Arcy } from '../mascot/Arcy'
import { useArc } from '../../store/arc'
import { runTurn, resetConversation } from '../../services/agentLoop'
import { listProjects, resumeProject, type SavedProject } from '../../services/persistence'

const CHIPS = ['A React to-do app', 'A coffee-shop landing page', 'A Snake game', 'A markdown notes app']

export function LaunchScreen() {
  const [text, setText] = useState('')
  const [recent, setRecent] = useState<SavedProject[]>([])
  const setView = useArc((s) => s.setView)
  const newProject = useArc((s) => s.newProject)
  const costume = useArc((s) => s.costume)

  useEffect(() => {
    listProjects().then(setRecent).catch(() => {})
  }, [])

  const go = (t?: string) => {
    const prompt = (t ?? text).trim()
    if (!prompt) return
    newProject()
    resetConversation()
    setView('workspace')
    window.setTimeout(() => void runTurn(prompt), 60)
  }

  const resume = async (id: string) => {
    resetConversation()
    await resumeProject(id)
    setView('workspace')
  }

  return (
    <div className="relative flex h-screen flex-col px-6">
      <header className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <ArcMark size={24} />
          <span className="font-display text-lg tracking-tight">Arc Coder</span>
        </div>
        <button
          onClick={() => setView('projects')}
          className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-1 px-3 py-1.5 text-[13px] text-body transition hover:border-accent/50 hover:text-ink"
        >
          <FolderOpen size={14} /> Projects
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center pb-10">
        <div className="w-full max-w-2xl text-center">
          <div className="arc-rise flex justify-center">
            <Arcy activity="idle" costume={costume} size={108} />
          </div>
          <p className="eyebrow arc-rise mt-5" style={{ animationDelay: '0.06s' }}>
            Arc Labs · Agentic Coding
          </p>
          <h1
            className="arc-rise mt-3 font-display text-[clamp(2.6rem,6vw,4rem)] font-medium leading-[1.02] tracking-[-0.02em]"
            style={{ animationDelay: '0.12s' }}
          >
            What do you want to build?
          </h1>
          <p className="arc-rise mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-body" style={{ animationDelay: '0.18s' }}>
            Describe it in plain words. Arc writes the code, runs it, and shows you a live preview — all in your browser.
          </p>

          <div className="arc-rise mt-8" style={{ animationDelay: '0.26s' }}>
            <div className="flex items-end gap-2 rounded-2xl border border-hairline bg-surface-1 p-2.5 shadow-[0_14px_60px_rgba(0,0,0,0.4)] transition focus-within:border-accent/50">
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    go()
                  }
                }}
                rows={2}
                placeholder="Build me a…"
                className="flex-1 resize-none bg-transparent px-3 py-2 text-left text-[15px] text-ink outline-none placeholder:text-muted"
              />
              <button
                onClick={() => go()}
                disabled={!text.trim()}
                className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-white transition hover:bg-accent-strong disabled:opacity-40"
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </div>

          <div className="arc-rise mt-5 flex flex-wrap items-center justify-center gap-2" style={{ animationDelay: '0.34s' }}>
            <span className="eyebrow mr-1">Try</span>
            {CHIPS.map((c) => (
              <button
                key={c}
                onClick={() => go(c)}
                className="rounded-full border border-hairline bg-surface-1 px-3.5 py-1.5 text-[13px] text-body transition hover:border-accent/50 hover:text-ink"
              >
                {c}
              </button>
            ))}
          </div>

          {recent.length > 0 && (
            <div className="arc-rise mt-9" style={{ animationDelay: '0.4s' }}>
              <div className="mb-2.5 flex items-center justify-center gap-2">
                <p className="eyebrow">Recent projects</p>
                {recent.length > 4 && (
                  <button onClick={() => setView('projects')} className="text-[11px] text-accent transition hover:underline">
                    View all →
                  </button>
                )}
              </div>
              <div className="flex flex-wrap justify-center gap-2.5">
                {recent.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => resume(p.id)}
                    className="min-w-40 rounded-xl border border-hairline bg-surface-1 px-4 py-2.5 text-left transition hover:border-accent/50"
                  >
                    <span className="block truncate text-[13px] text-ink">{p.name}</span>
                    <span className="block text-[11px] text-muted">{new Date(p.updatedAt).toLocaleDateString()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="arc-rise pb-6 text-center text-[12.5px] text-muted" style={{ animationDelay: '0.42s' }}>
        Two models — <span className="text-body">Arc3Mini</span> for speed, <span className="text-body">Arc3Ultra</span> for depth —
        chosen automatically as you work.
      </footer>
    </div>
  )
}
