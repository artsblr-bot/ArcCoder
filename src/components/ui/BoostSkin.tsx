import { AnimatePresence, motion } from 'framer-motion'
import { useArc } from '../../store/arc'

/** SUPERCODE skin: a restrained spectrum signal layered over the editorial UI. */
export function BoostSkin() {
  const boost = useArc((s) => s.boost)
  return (
    <AnimatePresence>
      {boost && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-30"
        >
          <div className="arc-spectrum absolute inset-x-0 top-0 h-[3px]" />
          <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 0 2px rgba(204,120,92,0.22)' }} />
          <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-dark px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-on-dark shadow-lg">
            <span className="arc-spectrum h-1.5 w-1.5 rounded-full" />
            Supercode
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
