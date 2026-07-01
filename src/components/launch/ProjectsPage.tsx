import { useEffect, useState, type MouseEvent } from 'react'
import { Plus, Trash2, MessageSquare, Clock, FolderOpen } from 'lucide-react'
import { ArcMark } from '../ui/ArcMark'
import { useArc } from '../../store/arc'
import { resetConversation } from '../../services/agentLoop'
import { listProjects, resumeProject, deleteProject, type SavedProject } from '../../services/persistence'

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<SavedProject[] | null>(null)
  const setView = useArc((s) => s.setView)

  const refresh = () => listProjects().then(setProjects).catch(() => setProjects([]))
  useEffect(() => {
    refresh()
  }, [])

  const open = async (id: string) => {
    resetConversation()
    await resumeProject(id)
    setView('workspace')
  }
  const remove = async (id: string, e: MouseEvent) => {
    e.stopPropagation()
    await deleteProject(id)
    refresh()
  }

  return (
    <div className="min-h-screen px-6 py-5">
      <header className="mx-auto flex max-w-5xl items-center justify-between">
        <button onClick={() => setView('launch')} className="flex items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-surface-2" title="Home">
          <ArcMark size={22} />
          <span className="font-display text-lg tracking-tight">Arc Coder</span>
        </button>
        <button
          onClick={() => setView('launch')}
          className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-1 px-3 py-1.5 text-[13px] text-body transition hover:border-accent/50 hover:text-ink"
        >
          <Plus size={14} /> New project
        </button>
      </header>

      <div className="mx-auto mt-10 max-w-5xl">
        <p className="eyebrow">Your work</p>
        <h1 className="mt-2 font-display text-[clamp(2rem,4vw,2.8rem)] font-medium tracking-[-0.02em]">Projects</h1>
        <p className="mt-2 text-[14px] text-body">Everything you build is saved automatically — pick up right where you left off.</p>

        {projects === null ? (
          <p className="mt-12 text-sm text-muted">Loading…</p>
        ) : projects.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-hairline-strong bg-surface-1 p-14 text-center">
            <FolderOpen size={28} className="mx-auto text-faint" />
            <p className="mt-3 text-[15px] text-body">No projects yet.</p>
            <button onClick={() => setView('launch')} className="mt-4 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition hover:bg-accent-strong">
              Start building
            </button>
          </div>
        ) : (
          <div className="mt-7 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const turns = (p.timeline ?? []).filter((t) => t.kind === 'user').length
              const files = Object.keys(p.files ?? {}).length
              return (
                <div
                  key={p.id}
                  onClick={() => open(p.id)}
                  className="group cursor-pointer rounded-2xl border border-hairline bg-surface-1 p-4 transition hover:border-accent/50 hover:shadow-[0_10px_40px_rgba(0,0,0,0.16)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="min-w-0 flex-1 truncate font-display text-[17px] tracking-tight text-ink">{p.name}</h2>
                    <button
                      onClick={(e) => remove(p.id, e)}
                      title="Delete project"
                      className="shrink-0 rounded-md p-1 text-faint opacity-0 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
                    <span className="flex items-center gap-1">
                      <Clock size={11} /> {timeAgo(p.updatedAt)}
                    </span>
                    <span>
                      {files} file{files === 1 ? '' : 's'}
                    </span>
                    {turns > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageSquare size={11} /> {turns} message{turns === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  {p.draft?.trim() && (
                    <p className="mt-3 line-clamp-2 rounded-lg bg-surface-2 px-2.5 py-2 text-[12px] italic text-body">Draft: {p.draft.trim()}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
