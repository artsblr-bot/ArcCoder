import { useEffect, useRef, type ReactNode } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Explorer } from './ide/Explorer'
import { EditorTabs, EditorBody } from './ide/EditorPane'
import { PreviewPane } from './ide/PreviewPane'
import { BlueprintTab } from './ide/BlueprintTab'
import { TerminalPane } from './ide/TerminalPane'
import { AgentPanel } from './chat/AgentPanel'
import { registerPanel } from './mascot/panelRegistry'
import { useArc, type PanelId } from '../store/arc'
import { getContainer, listDir, mountFiles, onPreviewError } from '../services/webcontainer'

const STARTER = `# Welcome to Arc Coder

This is your workspace. Ask **Arc** on the right to build something — a web app,
a script, a game — and watch it happen here.

- Real files, a real terminal (npm · node · git), and a live preview.
- Choose your model when you send a prompt: Arc3Mini for speed, Arc3Ultra for depth.
`

function Pane({ ids, navy, children }: { ids: PanelId[]; navy?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    ids.forEach((i) => registerPanel(i, node))
    return () => ids.forEach((i) => registerPanel(i, null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      ref={ref}
      className={`h-full min-h-0 overflow-hidden rounded-2xl border ${
        navy ? 'border-dark-hairline bg-dark shadow-[0_8px_28px_rgba(20,20,19,0.14)]' : 'border-hairline bg-surface-1'
      }`}
    >
      {children}
    </div>
  )
}

function Center() {
  const centerView = useArc((s) => s.centerView)
  return (
    <div className="flex h-full min-h-0 flex-col bg-dark">
      <EditorTabs />
      <div className="min-h-0 flex-1">
        {centerView === 'editor' ? <EditorBody /> : centerView === 'preview' ? <PreviewPane /> : <BlueprintTab />}
      </div>
    </div>
  )
}

const hHandle = 'w-2.5 transition-colors data-[resize-handle-state=hover]:bg-hairline data-[resize-handle-state=drag]:bg-accent/40'
const vHandle = 'h-2.5 transition-colors data-[resize-handle-state=hover]:bg-hairline data-[resize-handle-state=drag]:bg-accent/40'

export function Workspace() {
  const bumpTree = useArc((s) => s.bumpTree)
  const openFile = useArc((s) => s.openFile)

  useEffect(() => {
    let cancelled = false
    let unsub: (() => void) | undefined
    let lastErr = ''
    getContainer()
      .then(async () => {
        const roots = await listDir('/').catch(() => [])
        if (!cancelled && roots.length === 0) {
          await mountFiles({ 'README.md': STARTER })
          bumpTree()
          openFile('/README.md')
        }
        unsub = await onPreviewError((msg) => {
          if (msg === lastErr) return
          lastErr = msg
          const s = useArc.getState()
          s.pushTimeline({ kind: 'error', text: `Runtime error in the preview:\n${msg.slice(0, 300)}` })
          s.setArcy('fixing', 'preview')
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      unsub?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="h-full bg-canvas p-2.5">
      <PanelGroup direction="horizontal" className="h-full">
        <Panel defaultSize={18} minSize={12}>
          <Pane ids={['explorer']}>
            <Explorer />
          </Pane>
        </Panel>
        <PanelResizeHandle className={hHandle} />
        <Panel defaultSize={52} minSize={30}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={66} minSize={20}>
              <Pane ids={['editor', 'preview']} navy>
                <Center />
              </Pane>
            </Panel>
            <PanelResizeHandle className={vHandle} />
            <Panel defaultSize={34} minSize={12}>
              <Pane ids={['terminal']} navy>
                <TerminalPane />
              </Pane>
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle className={hHandle} />
        <Panel defaultSize={30} minSize={22}>
          <Pane ids={['agent']}>
            <AgentPanel />
          </Pane>
        </Panel>
      </PanelGroup>
    </div>
  )
}
