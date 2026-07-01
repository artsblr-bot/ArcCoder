import { useEffect, useRef, useState } from 'react'
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react'
import { X, Undo2 } from 'lucide-react'
import { useArc } from '../../store/arc'
import { languageForPath } from '../../lib/monacoSetup'
import { readFile, writeFile } from '../../services/webcontainer'

// Line indices (1-based) in `b` that are new or changed vs `a`, via an LCS walk.
function changedLines(a: string[], b: string[]): number[] {
  const n = a.length
  const m = b.length
  if (n > 1500 || m > 1500) return [] // skip the O(n·m) diff on very large files
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: number[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else out.push(++j) // 1-based line that's added/changed
  }
  while (j < m) out.push(++j)
  return out
}

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
  const baselines = useArc((s) => s.baselines)
  const clearBaseline = useArc((s) => s.clearBaseline)
  const bumpTree = useArc((s) => s.bumpTree)
  const fontSize = useArc((s) => s.fontSize)
  const [value, setValue] = useState('')
  const [valuePath, setValuePath] = useState<string | null>(null) // which file `value` belongs to
  const loadingRef = useRef(false)
  const edRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const decoRef = useRef<string[]>([])

  const streaming = !!streamFile && streamFile.path === activeFile
  const baseline = activeFile ? baselines[activeFile] : undefined

  useEffect(() => {
    if (!activeFile || streaming) return
    loadingRef.current = true
    const target = activeFile
    readFile(target)
      .then((c) => {
        // Ignore a stale read if the user already switched files.
        if (useArc.getState().activeFile !== target) return
        setValue(c)
        setValuePath(target)
      })
      .catch(() => {
        if (useArc.getState().activeFile !== target) return
        setValue('')
        setValuePath(target)
      })
      .finally(() => {
        loadingRef.current = false
      })
  }, [activeFile, streaming])

  const shown = streaming ? streamFile!.content : value
  // `value` is shared across files and loaded async — only trust it once it's for THIS file.
  const ready = streaming || valuePath === activeFile

  // Paint gutter marks on lines the agent added/changed this turn (debounced so typing
  // in a large agent-edited file doesn't re-run the O(n·m) diff on every keystroke).
  useEffect(() => {
    const ed = edRef.current
    const monaco = monacoRef.current
    if (!ed || !monaco) return
    if (!ready || baseline == null || baseline === shown || streaming) {
      decoRef.current = ed.deltaDecorations(decoRef.current, [])
      return
    }
    const id = setTimeout(() => {
      const lines = changedLines(baseline === '' ? [] : baseline.split('\n'), shown.split('\n'))
      decoRef.current = ed.deltaDecorations(
        decoRef.current,
        lines.map((ln) => ({
          range: new monaco.Range(ln, 1, ln, 1),
          options: { isWholeLine: true, linesDecorationsClassName: 'arc-diff-line' },
        })),
      )
    }, 150)
    return () => clearTimeout(id)
  }, [baseline, shown, streaming, activeFile, ready])

  const onChange = (v: string | undefined) => {
    const next = v ?? ''
    setValue(next)
    if (activeFile && !loadingRef.current && !streaming) void writeFile(activeFile, next)
  }

  const onRevert = () => {
    if (!activeFile || baseline == null) return
    const target = activeFile
    const reverted = baseline
    void writeFile(target, reverted).then(() => {
      // Don't clobber the editor if the user switched files during the write.
      if (useArc.getState().activeFile === target) setValue(reverted)
      clearBaseline(target)
      bumpTree()
    })
  }

  if (!activeFile)
    return (
      <div className="flex h-full items-center justify-center bg-dark-2 text-sm text-on-dark-soft">
        Select a file from the Explorer, or ask Arc to build something.
      </div>
    )

  const changed = ready && baseline != null && baseline !== shown && !streaming

  return (
    <div className="relative h-full">
      {changed && (
        <button
          onClick={onRevert}
          className="absolute right-3 top-2 z-10 flex items-center gap-1.5 rounded-md border border-accent/40 bg-dark-2/90 px-2.5 py-1 text-[11.5px] text-accent shadow-sm backdrop-blur transition hover:bg-dark-3"
          title="Undo Arc's changes to this file"
        >
          <Undo2 size={12} /> Revert Arc’s changes
        </button>
      )}
      <Editor
        theme="arc-dark"
        path={activeFile}
        language={languageForPath(activeFile)}
        value={shown}
        onChange={onChange}
        onMount={(ed, monaco) => {
          edRef.current = ed
          monacoRef.current = monaco
          ed.onDidChangeCursorPosition((e) => useArc.getState().setCursor(e.position.lineNumber, e.position.column))
          const countProblems = () => {
            const markers = monaco.editor.getModelMarkers({})
            const n = markers.filter((m) => m.severity >= monaco.MarkerSeverity.Warning).length
            useArc.getState().setProblems(n)
          }
          monaco.editor.onDidChangeMarkers(countProblems)
          countProblems()
        }}
        options={{
          fontSize,
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
    </div>
  )
}
