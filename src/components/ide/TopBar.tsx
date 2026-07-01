import { Settings, Download, Search } from 'lucide-react'
import JSZip from 'jszip'
import { ArcMark } from '../ui/ArcMark'
import { Menu, type MenuOption } from '../ui/Menu'
import { useArc } from '../../store/arc'
import { readProjectFiles } from '../../services/webcontainer'
import { saveCurrentProject } from '../../services/persistence'

const EXPORT_OPTS: MenuOption[] = [
  { value: 'zip', label: 'Download as ZIP', hint: 'Save the whole project to your computer' },
  { value: 'tab', label: 'Open preview in new tab', hint: 'Pop the running app out full-screen' },
  { value: 'github', label: 'Push to GitHub', hint: 'Commit & push the project (needs a token)' },
]

export function TopBar() {
  const projectName = useArc((s) => s.projectName)
  const setProjectName = useArc((s) => s.setProjectName)
  const previewUrl = useArc((s) => s.previewUrl)
  const setPalette = useArc((s) => s.setPalette)
  const setSettings = useArc((s) => s.setSettings)
  const setView = useArc((s) => s.setView)

  const onExport = async (v: string) => {
    if (v === 'zip') {
      const files = await readProjectFiles().catch(() => ({}))
      const zip = new JSZip()
      for (const [path, content] of Object.entries(files)) zip.file(path, content)
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectName || 'arc-project'}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } else if (v === 'tab') {
      if (previewUrl) window.open(previewUrl, '_blank')
    } else {
      alert('Pushing to GitHub is coming soon.')
    }
  }

  return (
    <header className="flex items-center gap-3 border-b border-hairline bg-surface-1 px-4" style={{ height: 52 }}>
      <button
        onClick={() => {
          void saveCurrentProject()
          setView('launch')
        }}
        className="flex items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-surface-2"
        title="Home — projects"
      >
        <ArcMark size={23} />
        <span className="font-display text-[17px] tracking-tight">Arc Coder</span>
      </button>
      <div className="mx-1 h-5 w-px bg-hairline" />
      <input
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        spellCheck={false}
        className="w-48 rounded-md bg-transparent px-2 py-1 text-[13px] text-body outline-none transition hover:bg-surface-2 focus:bg-surface-2 focus:text-ink"
        aria-label="Project name"
      />

      <div className="flex-1" />

      <button
        onClick={() => setPalette(true)}
        className="flex items-center gap-2 rounded-lg border border-hairline px-2.5 py-1.5 text-[12.5px] text-muted transition hover:border-hairline-strong hover:text-ink"
        title="Command palette"
      >
        <Search size={13} />
        <span>Search</span>
        <kbd className="ml-1 rounded bg-surface-3 px-1 font-mono text-[10px]">⌘K</kbd>
      </button>

      <Menu
        value=""
        options={EXPORT_OPTS}
        onChange={onExport}
        align="right"
        width={264}
        trigger={
          <span className="flex items-center gap-1.5">
            <Download size={14} /> Export
          </span>
        }
      />

      <button onClick={() => setSettings(true)} className="rounded-lg border border-hairline p-2 text-body transition hover:border-hairline-strong hover:text-ink" title="Settings">
        <Settings size={15} />
      </button>
    </header>
  )
}
