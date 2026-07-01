import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { X } from 'lucide-react'
import { useArc } from '../../store/arc'
import { languageForPath } from '../../lib/monacoSetup'
import { readFile, writeFile } from '../../services/webcontainer'

export function EditorTabs() {
  const openFiles = useArc((s) => s.openFiles)
  const activeFile = useArc((s) => s.activeFile)
  const setActiveFile = useArc((s) => s.setActiveFile)
  const closeFile = useArc((s) => s.closeFile)
  const centerView = useArc((s) => s.centerView)
  const setCenterView = useArc((s) => s.setCenterView)

  return (
    <div className="flex h-9 items-stretch overflow-x-auto border-b border-dark-hairline bg-dark">
      {openFiles.map((path) => {
        const active = activeFile === path && centerView === 'editor'
        return (
          <div
            key={path}
            onClick={() => setActiveFile(path)}
            className={`group flex cursor-pointer items-center gap-2 border-r border-dark-hairline px-3 text-[13px] ${
              active ? 'bg-dark-2 text-on-dark' : 'text-on-dark-soft hover:text-on-dark'
            }`}
          >
            <span className="truncate">{path.split('/').pop()}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeFile(path)
              }}
              className="rounded p-0.5 opacity-0 transition group-hover:opacity-100 hover:bg-dark-3"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
      <div className="flex-1" />
      {(['preview', 'blueprint'] as const).map((v) => (
        <button
          key={v}
          onClick={() => setCenterView(v)}
          className={`border-l border-dark-hairline px-3 font-mono text-[11px] uppercase tracking-wider transition ${
            centerView === v ? 'bg-dark-2 text-accent' : 'text-on-dark-soft hover:text-on-dark'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

export function EditorBody() {
  const activeFile = useArc((s) => s.activeFile)
  const streamFile = useArc((s) => s.streamFile)
  const [value, setValue] = useState('')
  const loadingRef = useRef(false)

  const streaming = !!streamFile && streamFile.path === activeFile

  useEffect(() => {
    if (!activeFile || streaming) return
    loadingRef.current = true
    readFile(activeFile)
      .then((c) => setValue(c))
      .catch(() => setValue(''))
      .finally(() => {
        loadingRef.current = false
      })
  }, [activeFile, streaming])

  const onChange = (v: string | undefined) => {
    const next = v ?? ''
    setValue(next)
    if (activeFile && !loadingRef.current && !streaming) void writeFile(activeFile, next)
  }

  if (!activeFile)
    return (
      <div className="flex h-full items-center justify-center bg-dark-2 text-sm text-on-dark-soft">
        Select a file from the Explorer, or ask Arc to build something.
      </div>
    )

  const shown = streaming ? streamFile!.content : value

  return (
    <Editor
      theme="arc-dark"
      path={activeFile}
      language={languageForPath(activeFile)}
      value={shown}
      onChange={onChange}
      options={{
        fontSize: 13,
        fontFamily: 'JetBrains Mono Variable, monospace',
        fontLigatures: true,
        minimap: { enabled: false },
        smoothScrolling: true,
        cursorSmoothCaretAnimation: 'on',
        padding: { top: 14 },
        scrollBeyondLastLine: false,
        renderLineHighlight: 'all',
        tabSize: 2,
        readOnly: streaming,
      }}
    />
  )
}
