import { useState } from 'react'
import { Smartphone, Tablet, Monitor, Maximize, RotateCw, ExternalLink } from 'lucide-react'
import { useArc } from '../../store/arc'

const DEVICES = [
  { id: 'mobile', icon: Smartphone, width: 390 },
  { id: 'tablet', icon: Tablet, width: 834 },
  { id: 'desktop', icon: Monitor, width: 1280 },
  { id: 'full', icon: Maximize, width: null },
] as const

export function PreviewPane() {
  const previewUrl = useArc((s) => s.previewUrl)
  const [device, setDevice] = useState<(typeof DEVICES)[number]['id']>('full')
  const [route, setRoute] = useState('/')
  const [nonce, setNonce] = useState(0)

  const width = DEVICES.find((d) => d.id === device)!.width
  const base = previewUrl?.replace(/\/$/, '') ?? ''
  const src = previewUrl ? `${base}${route.startsWith('/') ? route : '/' + route}` : ''

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
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setNonce((n) => n + 1)}
            className="flex-1 bg-transparent py-1 font-mono text-xs text-on-dark outline-none placeholder:text-on-dark-soft"
            placeholder="/"
          />
        </div>
        <button onClick={() => setNonce((n) => n + 1)} className="rounded p-1.5 text-on-dark-soft hover:text-on-dark" title="Reload">
          <RotateCw size={13} />
        </button>
        <button onClick={() => src && window.open(src, '_blank')} className="rounded p-1.5 text-on-dark-soft hover:text-on-dark" title="Open in new tab">
          <ExternalLink size={13} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-3">
        {previewUrl ? (
          <iframe
            key={nonce}
            src={src}
            title="preview"
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
    </div>
  )
}
