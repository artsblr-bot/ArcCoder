import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { ArcModelId } from '../config/providers'
import type { AgentMode } from '../config/prompts'
import type { EffortLevel } from '../services/effort'
import type { ArcyActivity } from '../components/mascot/types'
import { pickCostume, type CostumeId } from '../components/mascot/costumes'

export type View = 'launch' | 'workspace' | 'projects'
export type PanelId = 'agent' | 'editor' | 'terminal' | 'explorer' | 'preview'
export type CenterView = 'editor' | 'preview' | 'blueprint'
export type AgentStatus = 'idle' | 'thinking' | 'working' | 'error'

export type TimelineItem =
  | { kind: 'user'; id: string; text: string; images?: string[] }
  | { kind: 'reasoning'; id: string; text: string; done?: boolean }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'action'; id: string; tool: string; title: string; detail?: string; path?: string; status: 'running' | 'done' | 'error' }
  | { kind: 'plan'; id: string; title: string; steps: string[]; status: 'pending' | 'approved' }
  | { kind: 'switch'; id: string; text: string; to: ArcModelId }
  | { kind: 'error'; id: string; text: string }

export interface Task {
  id: string
  text: string
  status: 'pending' | 'active' | 'done'
}

// Distributes Omit over the union so each member keeps its own fields (a plain
// Omit<Union,'id'> would collapse to only the common keys).
type DistributiveOmitId<T> = T extends unknown ? Omit<T, 'id'> & { id?: string } : never
export type TimelineInput = DistributiveOmitId<TimelineItem>

export interface ArcyState {
  activity: ArcyActivity
  target: PanelId
}

interface ArcState {
  // shell
  view: View
  projectName: string
  theme: 'dark' | 'light'
  fontSize: number
  sessionId: string
  costume: CostumeId
  projectId: string

  // agent controls
  model: ArcModelId
  override: ArcModelId | null
  mode: AgentMode
  effort: EffortLevel
  status: AgentStatus

  // conversation
  timeline: TimelineItem[]
  tasks: Task[]
  contextTokens: number
  toast: { id: string; text: string } | null
  boost: boolean
  paletteOpen: boolean
  settingsOpen: boolean
  streamFile: { path: string; content: string } | null
  pendingQuestion: { id: string; question: string; options: string[] } | null
  draft: string // what the user is typing in the composer (autosaved per project)

  // mascot
  arcy: ArcyState

  // editor / files
  openFiles: string[]
  activeFile: string | null
  centerView: CenterView
  previewUrl: string | null
  previewInjected: boolean // true only when Arc's static server serves the preview (enables console + click-to-point)
  agentTouched: Record<string, number>
  baselines: Record<string, string> // content before the agent's edits this turn (for diff gutters + revert)
  treeVersion: number
  cursor: { line: number; col: number }
  problems: number
}

interface ArcActions {
  setView: (v: View) => void
  setProjectName: (n: string) => void
  setDraft: (d: string) => void
  toggleTheme: () => void
  setFontSize: (n: number) => void
  setCursor: (line: number, col: number) => void
  setProblems: (n: number) => void
  hydrate: (p: Partial<ArcState>) => void
  newProject: () => void

  setModel: (m: ArcModelId) => void
  setOverride: (m: ArcModelId | null) => void
  setMode: (m: AgentMode) => void
  setEffort: (e: EffortLevel) => void
  setStatus: (s: AgentStatus) => void

  pushTimeline: (item: TimelineInput) => string
  updateTimeline: (id: string, patch: Record<string, unknown>) => void
  appendText: (id: string, kind: 'reasoning' | 'assistant', delta: string) => void
  finishRunningCards: () => void
  clearTimeline: () => void

  setTasks: (t: Task[]) => void
  setToast: (text: string | null) => void
  setBoost: (b: boolean) => void
  setPalette: (b: boolean) => void
  setSettings: (b: boolean) => void
  setStreamFile: (path: string, content: string) => void
  clearStreamFile: () => void
  setPendingQuestion: (q: ArcState['pendingQuestion']) => void
  addContext: (n: number) => void
  resetContext: () => void

  setArcy: (activity: ArcyActivity, target?: PanelId) => void

  openFile: (path: string) => void
  closeFile: (path: string) => void
  setActiveFile: (path: string | null) => void
  setCenterView: (v: CenterView) => void
  setPreviewUrl: (url: string | null) => void
  setPreviewInjected: (b: boolean) => void
  markTouched: (path: string) => void
  captureBaseline: (path: string, content: string) => void
  clearBaseline: (path: string) => void
  resetBaselines: () => void
  bumpTree: () => void
}

const SID = nanoid(8)

function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.classList.toggle('light', theme === 'light')
  localStorage.setItem('arc-theme', theme)
}

const startWorkspace = typeof location !== 'undefined' && new URLSearchParams(location.search).has('ws')

export const useArc = create<ArcState & ArcActions>((set, get) => ({
  view: startWorkspace ? 'workspace' : 'launch',
  projectName: 'untitled',
  theme: localStorage.getItem('arc-theme') === 'light' ? 'light' : 'dark',
  fontSize: Number(localStorage.getItem('arc-font-size')) || 13,
  sessionId: SID,
  costume: pickCostume(SID),
  projectId: nanoid(10),

  model: 'arc3mini',
  override: 'arc3mini',
  mode: 'build',
  effort: 'medium',
  status: 'idle',

  timeline: [],
  tasks: [],
  contextTokens: 0,
  toast: null,
  boost: false,
  paletteOpen: false,
  settingsOpen: false,
  streamFile: null,
  pendingQuestion: null,
  draft: '',

  arcy: { activity: 'idle', target: 'agent' },

  openFiles: [],
  activeFile: null,
  centerView: 'editor',
  previewUrl: null,
  previewInjected: false,
  agentTouched: {},
  baselines: {},
  treeVersion: 0,
  cursor: { line: 1, col: 1 },
  problems: 0,

  setView: (view) => set({ view }),
  setProjectName: (projectName) => set({ projectName }),
  setDraft: (draft) => set({ draft }),
  hydrate: (p) => set(p),
  newProject: () =>
    set({ projectId: nanoid(10), projectName: 'untitled', timeline: [], tasks: [], openFiles: [], activeFile: null, previewUrl: null, previewInjected: false, contextTokens: 0, centerView: 'editor', draft: '', baselines: {}, agentTouched: {}, problems: 0, cursor: { line: 1, col: 1 } }),
  toggleTheme: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(theme)
    set({ theme })
  },
  setFontSize: (fontSize) => {
    localStorage.setItem('arc-font-size', String(fontSize))
    set({ fontSize })
  },
  setCursor: (line, col) => set({ cursor: { line, col } }),
  setProblems: (problems) => set({ problems }),

  setModel: (model) => set({ model }),
  setOverride: (override) => set({ override }),
  setMode: (mode) => set({ mode }),
  setEffort: (effort) => set({ effort }),
  setStatus: (status) => set({ status }),

  pushTimeline: (item) => {
    const id = item.id ?? nanoid(10)
    set((s) => ({ timeline: [...s.timeline, { ...item, id } as TimelineItem] }))
    return id
  },
  updateTimeline: (id, patch) =>
    set((s) => ({ timeline: s.timeline.map((t) => (t.id === id ? ({ ...t, ...patch } as TimelineItem) : t)) })),
  appendText: (id, kind, delta) =>
    set((s) => ({
      timeline: s.timeline.map((t) => (t.id === id && t.kind === kind ? { ...t, text: t.text + delta } : t)),
    })),
  finishRunningCards: () =>
    set((s) => ({
      timeline: s.timeline.map((t) => (t.kind === 'action' && t.status === 'running' ? { ...t, status: 'error' as const } : t)),
    })),
  clearTimeline: () => set({ timeline: [], tasks: [] }),

  setTasks: (tasks) => set({ tasks }),
  setToast: (text) => set({ toast: text ? { id: nanoid(6), text } : null }),
  setBoost: (boost) => set({ boost }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setSettings: (settingsOpen) => set({ settingsOpen }),
  setStreamFile: (path, content) =>
    set((s) => ({
      streamFile: { path, content },
      openFiles: s.openFiles.includes(path) ? s.openFiles : [...s.openFiles, path],
      activeFile: path,
      centerView: 'editor',
    })),
  clearStreamFile: () => set({ streamFile: null }),
  setPendingQuestion: (pendingQuestion) => set({ pendingQuestion }),
  addContext: (n) => set((s) => ({ contextTokens: s.contextTokens + n })),
  resetContext: () => set({ contextTokens: 0 }),

  setArcy: (activity, target) => set((s) => ({ arcy: { activity, target: target ?? s.arcy.target } })),

  openFile: (path) =>
    set((s) => ({
      openFiles: s.openFiles.includes(path) ? s.openFiles : [...s.openFiles, path],
      activeFile: path,
      centerView: 'editor',
    })),
  closeFile: (path) =>
    set((s) => {
      const openFiles = s.openFiles.filter((p) => p !== path)
      const activeFile = s.activeFile === path ? (openFiles[openFiles.length - 1] ?? null) : s.activeFile
      return { openFiles, activeFile }
    }),
  setActiveFile: (activeFile) => set({ activeFile, centerView: 'editor' }),
  setCenterView: (centerView) => set({ centerView }),
  setPreviewUrl: (previewUrl) => set({ previewUrl }),
  setPreviewInjected: (previewInjected) => set({ previewInjected }),
  markTouched: (path) => set((s) => ({ agentTouched: { ...s.agentTouched, [path]: Date.now() } })),
  // Remember the pre-edit content once per file per turn, so the editor can show a diff.
  captureBaseline: (path, content) =>
    set((s) => (path in s.baselines ? {} : { baselines: { ...s.baselines, [path]: content } })),
  clearBaseline: (path) =>
    set((s) => {
      const { [path]: _drop, ...rest } = s.baselines
      return { baselines: rest }
    }),
  resetBaselines: () => set({ baselines: {} }),
  bumpTree: () => set((s) => ({ treeVersion: s.treeVersion + 1 })),
}))
