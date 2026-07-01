import { useEffect, useRef, useState } from 'react'
import { ChevronRight, File, Folder, FolderOpen, Plus, RefreshCw, Upload, FolderUp, Search, Trash2, Pencil, FilePlus, FolderPlus } from 'lucide-react'
import { useArc } from '../../store/arc'
import { listDir, writeFile, ensureDir, renamePath, removePath, listAllFiles, type DirEntry } from '../../services/webcontainer'

type MenuState = { x: number; y: number; entry: DirEntry } | null
type Dropped = { path: string; file: File }

// Folders can't be excluded from imports (heavy, and never useful in a fresh project).
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|\.next|\.cache|\.turbo)(\/|$)/

// Walk a dropped directory tree (the drag-drop "entries" API) into a flat file list.
async function readEntry(entry: FileSystemEntry, prefix: string, out: Dropped[]): Promise<void> {
  const path = prefix + entry.name
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
    out.push({ path, file })
  } else if (entry.isDirectory) {
    if (SKIP_DIR.test('/' + path)) return
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const entries: FileSystemEntry[] = await new Promise((resolve) => {
      const all: FileSystemEntry[] = []
      const step = () =>
        reader.readEntries((batch) => {
          if (!batch.length) return resolve(all)
          all.push(...batch)
          step()
        }, () => resolve(all))
      step()
    })
    for (const child of entries) await readEntry(child, path + '/', out)
  }
}

function Node({ entry, depth, onMenu }: { entry: DirEntry; depth: number; onMenu: (e: DirEntry, ev: React.MouseEvent) => void }) {
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
        onContextMenu={(e) => onMenu(entry, e)}
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
      {open && children?.map((c) => <Node key={c.path} entry={c} depth={depth + 1} onMenu={onMenu} />)}
    </div>
  )
}

function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const bumpTree = useArc((s) => s.bumpTree)
  const closeFile = useArc((s) => s.closeFile)
  if (!menu) return null
  const { entry } = menu
  const dir = entry.dir ? entry.path : entry.path.replace(/\/[^/]*$/, '')

  const act = async (fn: () => Promise<void>) => {
    onClose()
    await fn().catch((e) => alert(String((e as Error)?.message ?? e)))
    bumpTree()
  }
  const Item = ({ icon: Icon, label, danger, onClick }: { icon: typeof File; label: string; danger?: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-surface-2 ${danger ? 'text-danger' : 'text-body hover:text-ink'}`}
    >
      <Icon size={13} /> {label}
    </button>
  )

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div className="fixed z-50 w-44 overflow-hidden rounded-lg border border-hairline bg-surface-1 py-1 shadow-xl" style={{ left: menu.x, top: menu.y }}>
        {entry.dir && (
          <>
            <Item icon={FilePlus} label="New file" onClick={() => act(async () => {
              const name = prompt('New file name'); if (!name) return
              await writeFile(`${dir}/${name}`.replace(/^\//, ''), '')
            })} />
            <Item icon={FolderPlus} label="New folder" onClick={() => act(async () => {
              const name = prompt('New folder name'); if (!name) return
              await ensureDir(`${dir}/${name}`.replace(/^\//, ''))
            })} />
            <div className="my-1 h-px bg-hairline" />
          </>
        )}
        <Item icon={Pencil} label="Rename" onClick={() => act(async () => {
          const next = prompt('Rename to', entry.name); if (!next || next === entry.name) return
          // Rename targets the entry's PARENT — not `dir` (which is the folder itself).
          const parent = entry.path.replace(/\/[^/]*$/, '')
          await renamePath(entry.path, `${parent}/${next}`.replace(/^\/+/, '/'))
        })} />
        <Item icon={Trash2} label="Delete" danger onClick={() => act(async () => {
          if (!confirm(`Delete ${entry.name}?`)) return
          await removePath(entry.path)
          closeFile(entry.path)
        })} />
      </div>
    </>
  )
}

export function Explorer() {
  const treeVersion = useArc((s) => s.treeVersion)
  const bumpTree = useArc((s) => s.bumpTree)
  const openFile = useArc((s) => s.openFile)
  const [roots, setRoots] = useState<DirEntry[]>([])
  const [menu, setMenu] = useState<MenuState>(null)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listDir('/')
      .then(setRoots)
      .catch(() => setRoots([]))
  }, [treeVersion])

  // Search flattens the whole tree so lazy-loaded folders are still findable.
  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      setMatches([])
      return
    }
    let cancelled = false
    listAllFiles()
      .then((paths) => {
        if (cancelled) return
        setMatches(paths.filter((p) => p.toLowerCase().includes(q)).slice(0, 200))
      })
      .catch(() => setMatches([]))
    return () => {
      cancelled = true
    }
  }, [query, treeVersion])

  const onMenu = (entry: DirEntry, e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ x: Math.min(e.clientX, window.innerWidth - 180), y: e.clientY, entry })
  }

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

  // Write a flat list of dropped/selected files into the project (binary-safe).
  const writeAll = async (items: Dropped[]) => {
    if (!items.length) return
    setImporting(items.length)
    let done = 0
    for (const { path, file } of items) {
      try {
        const buf = new Uint8Array(await file.arrayBuffer())
        await writeFile(path.replace(/^\/+/, ''), buf)
      } catch {
        /* skip unreadable */
      }
      if (++done % 12 === 0) bumpTree() // refresh periodically for big imports
    }
    setImporting(0)
    bumpTree()
  }

  // <input> uploads: folder pickers set webkitRelativePath so the tree is preserved.
  const fromInput = (list: FileList | null) => {
    if (!list?.length) return
    void writeAll(
      Array.from(list)
        .map((f) => ({ path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, file: f }))
        .filter((d) => !SKIP_DIR.test('/' + d.path)),
    )
  }

  // Drag-drop: use the entries API when present so dropped FOLDERS recurse; else flat files.
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dt = e.dataTransfer
    const entries = Array.from(dt.items || [])
      .map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null))
      .filter((x): x is FileSystemEntry => !!x)
    if (entries.length) {
      const out: Dropped[] = []
      for (const entry of entries) await readEntry(entry, '', out)
      await writeAll(out)
    } else {
      await writeAll(Array.from(dt.files).map((f) => ({ path: f.name, file: f })))
    }
  }

  return (
    <div
      className="flex h-full flex-col bg-surface-1"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => void onDrop(e)}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="font-display text-[13px] uppercase tracking-wider text-muted">Explorer</span>
        <div className="flex items-center gap-0.5 text-muted">
          <button onClick={newFile} className="rounded p-1 hover:bg-surface-2 hover:text-ink" title="New file">
            <Plus size={14} />
          </button>
          <button onClick={() => fileInput.current?.click()} className="rounded p-1 hover:bg-surface-2 hover:text-ink" title="Upload files">
            <Upload size={13} />
          </button>
          <button onClick={() => folderInput.current?.click()} className="rounded p-1 hover:bg-surface-2 hover:text-ink" title="Upload a folder">
            <FolderUp size={13} />
          </button>
          <button onClick={() => bumpTree()} className="rounded p-1 hover:bg-surface-2 hover:text-ink" title="Refresh">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <div className="px-2.5 pb-1.5">
        <div className="flex items-center gap-1.5 rounded-md border border-hairline bg-surface-2/60 px-2 py-1">
          <Search size={12} className="text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files"
            spellCheck={false}
            className="w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-muted"
          />
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          fromInput(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={folderInput}
        type="file"
        // @ts-expect-error non-standard but widely supported directory-picker attributes
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={(e) => {
          fromInput(e.target.files)
          e.target.value = ''
        }}
      />
      {importing > 0 && <div className="px-3 pb-1 text-[11px] text-accent">Importing {importing} file{importing === 1 ? '' : 's'}…</div>}

      <div className={`min-h-0 flex-1 overflow-auto px-1.5 pb-3 ${dragging ? 'ring-2 ring-inset ring-accent/50' : ''}`}>
        {query.trim() ? (
          matches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted">No files match “{query}”.</p>
          ) : (
            matches.map((p) => (
              <button
                key={p}
                onClick={() => openFile('/' + p.replace(/^\//, ''))}
                className="flex w-full items-center gap-1.5 rounded-md py-[3px] pl-2 pr-2 text-left text-[12.5px] text-body hover:bg-surface-2 hover:text-ink"
              >
                <File size={13} className="shrink-0 text-muted" />
                <span className="truncate">{p}</span>
              </button>
            ))
          )
        ) : roots.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted">No files yet. Ask Arc to build something, add a file with +, or drop files &amp; folders here.</p>
        ) : (
          roots.map((r) => <Node key={r.path} entry={r} depth={0} onMenu={onMenu} />)
        )}
        {!query.trim() && (
          <button onClick={newFolder} className="mt-1 px-3 py-1 text-[11px] text-muted hover:text-accent">
            + new folder
          </button>
        )}
      </div>

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  )
}
