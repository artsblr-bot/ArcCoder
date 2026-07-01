import { useEffect, useState } from 'react'
import { ChevronRight, File, Folder, FolderOpen, Plus, RefreshCw } from 'lucide-react'
import { useArc } from '../../store/arc'
import { listDir, writeFile, ensureDir, type DirEntry } from '../../services/webcontainer'

function Node({ entry, depth }: { entry: DirEntry; depth: number }) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<DirEntry[] | null>(null)
  const openFile = useArc((s) => s.openFile)
  const activeFile = useArc((s) => s.activeFile)
  const touched = useArc((s) => s.agentTouched)
  const treeVersion = useArc((s) => s.treeVersion)

  const load = async () => {
    try {
      setChildren(await listDir(entry.path))
    } catch {
      setChildren([])
    }
  }
  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeVersion])

  const toggle = () => {
    if (entry.dir) {
      if (!open) load()
      setOpen((o) => !o)
    } else openFile(entry.path)
  }

  const recent = touched[entry.path] && Date.now() - touched[entry.path] < 4000
  const active = activeFile === entry.path

  return (
    <div>
      <button
        onClick={toggle}
        className={`flex w-full items-center gap-1 rounded-md py-[3px] pr-2 text-left text-[13px] transition ${
          active ? 'bg-accent-soft text-ink' : 'text-body hover:bg-surface-2 hover:text-ink'
        } ${recent ? 'ring-1 ring-accent/60' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {entry.dir ? (
          <ChevronRight size={13} className={`shrink-0 transition ${open ? 'rotate-90' : ''}`} />
        ) : (
          <span className="w-[13px]" />
        )}
        {entry.dir ? (
          open ? <FolderOpen size={14} className="shrink-0 text-accent" /> : <Folder size={14} className="shrink-0 text-muted" />
        ) : (
          <File size={14} className="shrink-0 text-muted" />
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {open && children?.map((c) => <Node key={c.path} entry={c} depth={depth + 1} />)}
    </div>
  )
}

export function Explorer() {
  const treeVersion = useArc((s) => s.treeVersion)
  const bumpTree = useArc((s) => s.bumpTree)
  const [roots, setRoots] = useState<DirEntry[]>([])

  useEffect(() => {
    listDir('/')
      .then(setRoots)
      .catch(() => setRoots([]))
  }, [treeVersion])

  const newFile = async () => {
    const name = prompt('New file path (e.g. src/notes.md)')
    if (!name) return
    await writeFile(name.replace(/^\//, ''), '')
    bumpTree()
  }
  const newFolder = async () => {
    const name = prompt('New folder path (e.g. src/lib)')
    if (!name) return
    await ensureDir(name.replace(/^\//, ''))
    bumpTree()
  }

  return (
    <div className="flex h-full flex-col bg-surface-1">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="font-display text-[13px] uppercase tracking-wider text-muted">Explorer</span>
        <div className="flex items-center gap-0.5 text-muted">
          <button onClick={newFile} className="rounded p-1 hover:bg-surface-2 hover:text-ink" title="New file">
            <Plus size={14} />
          </button>
          <button onClick={() => bumpTree()} className="rounded p-1 hover:bg-surface-2 hover:text-ink" title="Refresh">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-3">
        {roots.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted">No files yet. Ask Arc to build something, or add a file with +.</p>
        ) : (
          roots.map((r) => <Node key={r.path} entry={r} depth={0} />)
        )}
        <button onClick={newFolder} className="mt-1 px-3 py-1 text-[11px] text-muted hover:text-accent">
          + new folder
        </button>
      </div>
    </div>
  )
}
