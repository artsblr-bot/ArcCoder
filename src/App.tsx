import { useEffect } from 'react'
import { useArc } from './store/arc'
import { restoreLastSession } from './services/persistence'
import { LaunchScreen } from './components/launch/LaunchScreen'
import { ProjectsPage } from './components/launch/ProjectsPage'
import { Workspace } from './components/Workspace'
import { TopBar } from './components/ide/TopBar'
import { StatusBar } from './components/ide/StatusBar'
import { ArcyRoamer } from './components/mascot/ArcyRoamer'
import { Toast } from './components/ui/Toast'
import { BoostSkin } from './components/ui/BoostSkin'
import { CommandPalette } from './components/ui/CommandPalette'
import { Settings } from './components/ui/Settings'

export default function App() {
  const view = useArc((s) => s.view)

  // On a fresh page load (not the E2E ?ws harness), bring back the last project —
  // but bail if the user starts/opens a project while the container is still booting.
  useEffect(() => {
    if (new URLSearchParams(location.search).has('ws')) return
    if (useArc.getState().view !== 'launch') return
    const startId = useArc.getState().projectId
    const stillValid = () => useArc.getState().view === 'launch' && useArc.getState().projectId === startId
    void restoreLastSession(stillValid).then((ok) => {
      if (ok && useArc.getState().view === 'launch') useArc.getState().setView('workspace')
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useArc.getState().setPalette(!useArc.getState().paletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas text-ink">
      {view === 'workspace' ? (
        <>
          <TopBar />
          <div className="min-h-0 flex-1">
            <Workspace />
          </div>
          <StatusBar />
        </>
      ) : view === 'projects' ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <ProjectsPage />
        </div>
      ) : (
        <LaunchScreen />
      )}
      <ArcyRoamer />
      <Toast />
      <BoostSkin />
      <CommandPalette />
      <Settings />
    </div>
  )
}
