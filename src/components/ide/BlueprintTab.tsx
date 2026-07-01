import { motion } from 'framer-motion'
import { Check, Compass } from 'lucide-react'
import { useArc } from '../../store/arc'

export function BlueprintTab() {
  const timeline = useArc((s) => s.timeline)
  const plan = [...timeline].reverse().find((t) => t.kind === 'plan')

  if (!plan || plan.kind !== 'plan') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-dark-2 text-center text-sm text-on-dark-soft">
        <Compass size={28} className="opacity-40" />
        <p>No blueprint yet.</p>
        <p className="text-xs">When Arc plans a build, the blueprint appears here to review before it builds.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-dark-2 px-8 py-9">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">Blueprint</p>
        <h2 className="mt-2 font-display text-3xl tracking-tight text-on-dark">{plan.title}</h2>
        <p className="mt-1.5 text-sm text-on-dark-soft">
          {plan.status === 'approved' ? 'Approved — Arc is building this.' : 'Review the plan, then approve to build.'}
        </p>
        <ol className="mt-7 space-y-2.5">
          {plan.steps.map((step, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-start gap-3 rounded-lg border border-dark-hairline bg-dark-3 p-3.5"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 font-mono text-[11px] text-accent">
                {plan.status === 'approved' ? <Check size={12} /> : i + 1}
              </span>
              <span className="text-sm text-on-dark">{step}</span>
            </motion.li>
          ))}
        </ol>
      </div>
    </div>
  )
}
