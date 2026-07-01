import { openDB, type IDBPDatabase } from 'idb'
import { useArc, type TimelineItem, type Task } from '../store/arc'
import type { CostumeId } from '../components/mascot/costumes'
import { readProjectFiles, mountFiles } from './webcontainer'

const DB_NAME = 'arc-coder'
const STORE = 'projects'

export interface SavedProject {
  id: string
  name: string
  files: Record<string, string>
  timeline: TimelineItem[]
  tasks: Task[]
  costume: CostumeId
  draft?: string
  updatedAt: number
}

let dbp: Promise<IDBPDatabase> | null = null
function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' })
      },
    })
  }
  return dbp
}

export async function listProjects(): Promise<SavedProject[]> {
  try {
    const all = (await (await db()).getAll(STORE)) as SavedProject[]
    return all.filter((p) => Object.keys(p.files || {}).length > 0).sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export async function loadProjectRecord(id: string): Promise<SavedProject | undefined> {
  try {
    return (await (await db()).get(STORE, id)) as SavedProject | undefined
  } catch {
    return undefined
  }
}

export async function deleteProject(id: string): Promise<void> {
  try {
    await (await db()).delete(STORE, id)
  } catch {
    /* ignore */
  }
}

/** Snapshot the live workspace (FS + conversation) and persist it. */
export async function saveCurrentProject(): Promise<void> {
  const s = useArc.getState()
  if (s.view !== 'workspace') return
  const files = await readProjectFiles().catch(() => ({}))
  if (Object.keys(files).length === 0) return
  try {
    await (await db()).put(STORE, {
      id: s.projectId,
      name: s.projectName,
      files,
      timeline: s.timeline,
      tasks: s.tasks,
      costume: s.costume,
      draft: s.draft,
      updatedAt: Date.now(),
    } satisfies SavedProject)
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
/** Debounced save — call freely after edits/turns. */
export function scheduleSave(delay = 1500): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    void saveCurrentProject()
  }, delay)
}

/** Mount a saved project into the workspace and hydrate the conversation. */
export async function resumeProject(id: string): Promise<boolean> {
  const rec = await loadProjectRecord(id)
  if (!rec) return false
  await mountFiles(rec.files)
  const s = useArc.getState()
  s.hydrate({
    projectId: rec.id,
    projectName: rec.name,
    timeline: rec.timeline ?? [],
    tasks: rec.tasks ?? [],
    costume: rec.costume,
    draft: rec.draft ?? '',
    openFiles: [],
    activeFile: null,
    previewUrl: null,
  })
  s.bumpTree()
  return true
}
