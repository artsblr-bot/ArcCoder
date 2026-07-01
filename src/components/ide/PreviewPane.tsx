import { useEffect, useRef, useState } from 'react'
import { Smartphone, Tablet, Monitor, Maximize, RotateCw, ExternalLink, MousePointerClick, Terminal, X, Trash2 } from 'lucide-react'
import { useArc } from '../../store/arc'
import { scheduleSave } from '../../services/persistence'

const DEVICES = [
  { id: 'mobile', icon: Smartphone, width: 390 },
  { id: 'tablet', icon: Tablet, width: 834 },
  { id: 'desktop', icon: Monitor, width: 1280 },
  { id: 'full', icon: Maximize, width: null },
] as const

interface LogLine {
  id: number
  level: string
  text: string
}

export function PreviewPane() {
  const previewUrl = useArc((s) => s.previewUrl)
  const injected = useArc((s) => s.previewInjected)
  const setDraft = useArc((s) => s.setDraft)
  const setToast = useArc((s) => s.setToast)
  const [device, setDevice] = useState<(typeof DEVICES)[number]['id']>('full')
  const [routeInput, setRouteInput] = useState('/') // what's typed in the field
  const [route, setRoute] = useState('/') // the applied route (only changes on Enter/reload)
  const [nonce, setNonce] = useState(0)
  const [inspecting, setInspecting] = useState(false)
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [logs, setLogs] = useState<LogLine[]>([])
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const logId = useRef(0)

  const width = DEVICES.find((d) => d.id === device)!.width
  const base = previewUrl?.replace(/\/$/, '') ?? ''
  const src = previewUrl ? `${base}${route.startsWith('/') ? route : '/' + route}` : ''

  // Only the injected agent (Arc's static server) can talk back; disable inspect/console otherwise.
  const canInspect = injected

  // Messages posted by the agent injected into served pages (console, errors, picks).
  // Trust only the direct preview frame — not nested/foreign iframes.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      const d = e.data
      if (!d || d.source !== 'arc') return
      if (d.kind === 'console' || d.kind === 'error') {
        setLogs((prev) => [...prev.slice(-199), { id: logId.current++, level: d.kind === 'error' ? 'error' : d.level || 'log', text: String(d.text ?? '') }])
        if (d.kind === 'error') setConsoleOpen(true)
      } else if (d.kind === 'pick') {
        setInspecting(false)
        const label = d.selector + (d.text ? ` — “${d.text}”` : '')
        const prefix = `Change this element (${label}): `
        const cur = useArc.getState().draft.trim()
        setDraft(cur ? `${cur}\n\n${prefix}` : prefix) // keep any in-progress draft
        scheduleSave()
        setToast('Element selected — describe the change in the composer.')
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [setDraft, setToast])

  // If inspect was toggled off because the model wasn't injection-backed, keep UI honest.
  useEffect(() => {
    if (!canInspect && inspecting) setInspecting(false)
  }, [canInspect, inspecting])

  const postInspect = (on: boolean) => iframeRef.current?.contentWindow?.postMessage({ source: 'arc-host', kind: 'inspect', on }, '*')
  const toggleInspect = () => {
    const on = !inspecting
    setInspecting(on)
    postInspect(on)
  }

  const applyRoute = () => {
    setRoute(routeInput)
    setNonce((n) => n + 1)
  }

  const errorCount = logs.filter((l) => l.level === 'error').length

  return (
    <div className="flex h-full flex-col bg-dark-2">
      <div className="flex items-center gap-2 border-b border-dark-hairline bg-dark px-2 py-1.5">
        <div className="flex items-center gap-0.5">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDevice(d.id)}
              className={`rounded p-1.5 transition ${device === d.id ? 'bg-dark-3 text-accent' : 'text-on-dark-soft hover:text-on-dark'}`}
              title={d.id}
            >
              <d.icon size={14} />
            </button>
          ))}
        </div>
        <div className="flex flex-1 items-center gap-1 rounded-md border border-dark-hairline bg-dark-2 px-2">
          <input
            value={routeInput}
            onChange={(e) => setRouteInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyRoute()}
            className="flex-1 bg-transparent py-1 font-mono text-xs text-on-dark outline-none placeholder:text-on-dark-soft"
            placeholder="/"
          />
        </div>
        {canInspect && (
          <>
            <button
              onClick={toggleInspect}
              className={`rounded p-1.5 transition ${inspecting ? 'bg-accent/20 text-accent' : 'text-on-dark-soft hover:text-on-dark'}`}
              title="Click-to-point: pick an element to change"
            >
              <MousePointerClick size={14} />
            </button>
            <button
              onClick={() => setConsoleOpen((o) => !o)}
              className={`relative rounded p-1.5 transition ${consoleOpen ? 'bg-dark-3 text-accent' : 'text-on-dark-soft hover:text-on-dark'}`}
              title="Console"
            >
              <Terminal size={14} />
              {errorCount > 0 && !consoleOpen && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger px-0.5 text-[8px] font-bold text-white">
                  {errorCount}
                </span>
              )}
            </button>
          </>
        )}
        <button onClick={() => setNonce((n) => n + 1)} className="rounded p-1.5 text-on-dark-soft hover:text-on-dark" title="Reload">
          <RotateCw size={13} />
        </button>
        <button onClick={() => src && window.open(src, '_blank')} className="rounded p-1.5 text-on-dark-soft hover:text-on-dark" title="Open in new tab">
          <ExternalLink size={13} />
        </button>
      </div>

      {inspecting && (
        <div className="flex items-center gap-1.5 bg-accent/10 px-3 py-1 text-[11.5px] text-accent">
          <MousePointerClick size={12} /> Click an element in the preview to select it.
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-3">
        {previewUrl ? (
          <iframe
            ref={iframeRef}
            key={nonce}
            src={src}
            title="preview"
            onLoad={() => inspecting && postInspect(true)} // re-arm inspect after a (re)load
            className="h-full rounded-lg border-0 bg-white"
            style={{ width: width ?? '100%', maxWidth: '100%', boxShadow: width ? '0 8px 30px rgba(0,0,0,0.35)' : 'none' }}
            allow="cross-origin-isolated"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-on-dark-soft">
            <Monitor size={28} className="opacity-40" />
            <p>No preview yet.</p>
            <p className="text-xs">Ask Arc to build and run an app, or start a dev server in the terminal.</p>
          </div>
        )}
      </div>

      {consoleOpen && canInspect && (
        <div className="flex h-44 flex-col border-t border-dark-hairline bg-dark">
          <div className="flex items-center justify-between border-b border-dark-hairline px-3 py-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-on-dark-soft">Console</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setLogs([])} className="rounded p-1 text-on-dark-soft hover:text-on-dark" title="Clear">
                <Trash2 size={12} />
              </button>
              <button onClick={() => setConsoleOpen(false)} className="rounded p-1 text-on-dark-soft hover:text-on-dark" title="Close">
                <X size={12} />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-1.5 font-mono text-[11px] leading-relaxed">
            {logs.length === 0 ? (
              <p className="text-on-dark-soft">Console output from the preview appears here.</p>
            ) : (
              logs.map((l) => (
                <div key={l.id} className={`whitespace-pre-wrap ${l.level === 'error' ? 'text-danger' : l.level === 'warn' ? 'text-warning' : 'text-on-dark-soft'}`}>
                  {l.text}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
