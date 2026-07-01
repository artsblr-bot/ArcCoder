import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Zap } from 'lucide-react'
import { useArc } from '../../store/arc'

export function Toast() {
  const toast = useArc((s) => s.toast)
  const setToast = useArc((s) => s.setToast)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3600)
    return () => window.clearTimeout(t)
  }, [toast, setToast])

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: -16, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.92 }}
          className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-accent/40 bg-surface-2 px-4 py-2 text-sm text-ink shadow-[0_0_28px_rgba(96,165,250,0.4)]"
        >
          <Zap size={14} className="text-accent" />
          {toast.text}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
