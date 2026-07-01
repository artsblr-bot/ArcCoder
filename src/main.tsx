import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Variable fonts (bundled same-origin → safe under COEP cross-origin isolation).
import '@fontsource-variable/fraunces'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'

import './index.css'
import App from './App.tsx'
import { useArc } from './store/arc'
import { runTurn } from './services/agentLoop'
import { executeTool } from './services/tools'

// Dev-only test hook so E2E automation can drive + inspect the app.
if (import.meta.env.DEV) {
  ;(window as unknown as { __arc: unknown }).__arc = { store: useArc, runTurn, executeTool }
}

// Single editorial cream theme (design.md). Dev/verification: ?still freezes entrances.
if (new URLSearchParams(location.search).has('still')) document.documentElement.classList.add('arc-still')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
