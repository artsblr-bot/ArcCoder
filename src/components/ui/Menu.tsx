import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'

export interface MenuOption {
  value: string
  label: string
  hint?: string
  badge?: string
}

export function Menu({
  trigger,
  value,
  options,
  onChange,
  align = 'left',
  width = 240,
}: {
  trigger: ReactNode
  value: string
  options: MenuOption[]
  onChange: (v: string) => void
  align?: 'left' | 'right'
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-body transition hover:border-hairline-strong hover:text-ink"
      >
        {trigger}
        <ChevronDown size={13} className={`text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className={`absolute bottom-full z-50 mb-1.5 overflow-hidden rounded-xl border border-hairline-strong bg-surface-2 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.5)] ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
            style={{ width }}
          >
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-surface-3"
              >
                <span className="mt-0.5 w-3.5 shrink-0">
                  {o.value === value && <Check size={14} className="text-accent" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13px] text-ink">{o.label}</span>
                    {o.badge && (
                      <span className="rounded bg-accent-soft px-1 py-px font-mono text-[9px] uppercase tracking-wider text-accent">
                        {o.badge}
                      </span>
                    )}
                  </span>
                  {o.hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{o.hint}</span>}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
