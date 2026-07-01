import { GitBranch, Circle, Cpu, Gauge } from 'lucide-react'
import { useArc } from '../../store/arc'
import { ARC_MODELS } from '../../config/providers'
import { effortConfig } from '../../services/effort'

export function StatusBar() {
  const previewUrl = useArc((s) => s.previewUrl)
  const model = useArc((s) => s.model)
  const effort = useArc((s) => s.effort)
  const mode = useArc((s) => s.mode)
  const status = useArc((s) => s.status)

  const serverUp = !!previewUrl

  return (
    <footer className="flex h-7 items-center gap-4 border-t border-hairline bg-surface-1 px-3 font-mono text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        <Circle size={8} className={serverUp ? 'fill-success text-success' : 'fill-muted text-muted'} />
        {serverUp ? previewUrl!.replace(/^https?:\/\//, '') : 'no dev server'}
      </span>
      <span className="flex items-center gap-1.5">
        <GitBranch size={11} /> main
      </span>
      <div className="flex-1" />
      <span className="capitalize">{status}</span>
      <span className="flex items-center gap-1.5">
        <Cpu size={11} /> {ARC_MODELS[model].label}
      </span>
      <span className="flex items-center gap-1.5">
        <Gauge size={11} /> {effortConfig(effort).label} · {mode}
      </span>
    </footer>
  )
}
