import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// Bundle Monaco + its workers locally (no CDN) so it loads under COEP cross-origin isolation.
;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

// Dark-navy product surface (design.md surface-dark family) + coral cursor.
monaco.editor.defineTheme('arc-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#1f1e1b',
    'editor.foreground': '#ece7df',
    'editorLineNumber.foreground': '#56514a',
    'editorLineNumber.activeForeground': '#a09d96',
    'editor.selectionBackground': '#3a352d',
    'editor.lineHighlightBackground': '#252320',
    'editorCursor.foreground': '#cc785c',
    'editorGutter.background': '#1f1e1b',
    'editorWidget.background': '#252320',
    'editorIndentGuide.background1': '#2a2825',
  },
})
monaco.editor.defineTheme('arc-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#0b1220',
    'editorLineNumber.foreground': '#aebccd',
    'editor.lineHighlightBackground': '#f3f8ff',
    'editorCursor.foreground': '#3b82f6',
  },
})

loader.config({ monaco })

/** Pick a Monaco language id from a file path. */
export function languageForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    json: 'json', css: 'css', scss: 'scss', less: 'less', html: 'html', htm: 'html',
    md: 'markdown', markdown: 'markdown', yml: 'yaml', yaml: 'yaml', py: 'python', sh: 'shell',
    vue: 'html', svelte: 'html', txt: 'plaintext',
  }
  return map[ext] ?? 'plaintext'
}
