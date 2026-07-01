import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Shuffle, Sun, Moon, Play, Pause } from 'lucide-react'
import { Arcy } from '../components/mascot/Arcy'
import { ARCY_SAYS, type ArcyActivity } from '../components/mascot/types'
import { COSTUMES, pickCostume, type CostumeId } from '../components/mascot/costumes'

const ACTIVITIES: { id: ArcyActivity; label: string }[] = [
  { id: 'idle', label: 'Idle' },
  { id: 'thinking', label: 'Thinking' },
  { id: 'coding', label: 'Coding' },
  { id: 'building', label: 'Building' },
  { id: 'researching', label: 'Researching' },
  { id: 'planning', label: 'Planning' },
  { id: 'fixing', label: 'Fixing' },
  { id: 'pulling', label: 'Pulling' },
  { id: 'success', label: 'Success' },
  { id: 'overdrive', label: 'SUPERCODE' },
]

const ZONES: { label: string; activity: ArcyActivity }[] = [
  { label: 'Explorer', activity: 'planning' },
  { label: 'Editor', activity: 'coding' },
  { label: 'Terminal', activity: 'building' },
  { label: 'Preview', activity: 'researching' },
]

export default function ArcyPlayground() {
  const [activity, setActivity] = useState<ArcyActivity>('coding')
  const [costume, setCostume] = useState<CostumeId | 'random'>('random')
  const [seed, setSeed] = useState('arc-session-1')
  const [zone, setZone] = useState(1)
  const [touring, setTouring] = useState(true)
  const [light, setLight] = useState(() => document.documentElement.classList.contains('light'))

  const resolvedCostume: CostumeId = costume === 'random' ? pickCostume(seed) : costume

  useEffect(() => {
    if (!touring) return
    const t = setInterval(() => setZone((z) => (z + 1) % ZONES.length), 2400)
    return () => clearInterval(t)
  }, [touring])

  function toggleTheme() {
    const next = !light
    setLight(next)
    document.documentElement.classList.toggle('light', next)
    localStorage.setItem('arc-theme', next ? 'light' : 'dark')
  }

  return (
    <div className="min-h-screen w-full bg-canvas text-ink">
      {/* top bar */}
      <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
        <div className="flex items-center gap-3">
          <ArcMark />
          <span className="font-display text-xl tracking-tight">Arc Coder</span>
          <span className="rounded-full border border-hairline px-2 py-0.5 text-xs text-muted">Arcy preview</span>
        </div>
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 rounded-lg border border-hairline px-3 py-1.5 text-sm text-body transition hover:text-ink"
        >
          {light ? <Moon size={15} /> : <Sun size={15} />}
          {light ? 'Dark' : 'Light'}
        </button>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Arc Labs · mascot</p>
          <h1 className="mt-2 font-display text-5xl leading-[1.05] tracking-tight">Meet Arcy.</h1>
          <p className="mt-3 max-w-xl text-body">
            A creature of contained arc-light who roams your workspace and acts out whatever's really happening —
            dressed differently every session.
          </p>
        </motion.div>

        {/* hero stage */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-hairline bg-surface-1 py-10">
            <RadialGlow />
            <Arcy activity={activity} costume={resolvedCostume} size={260} />
            <motion.p
              key={activity}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="z-10 mt-2 rounded-full border border-hairline bg-surface-2 px-4 py-1.5 font-mono text-sm text-body"
            >
              {ARCY_SAYS[activity]}
            </motion.p>
          </div>

          {/* controls */}
          <div className="flex flex-col gap-6">
            <Section title="Activity">
              <div className="flex flex-wrap gap-2">
                {ACTIVITIES.map((a) => (
                  <Pill key={a.id} active={activity === a.id} onClick={() => setActivity(a.id)} glow={a.id === 'overdrive'}>
                    {a.label}
                  </Pill>
                ))}
              </div>
            </Section>

            <Section title="Wardrobe (per session)">
              <div className="flex flex-wrap gap-2">
                <Pill active={costume === 'random'} onClick={() => setCostume('random')}>
                  <Shuffle size={13} className="mr-1 inline" />
                  Random
                </Pill>
                {COSTUMES.map((c) => (
                  <Pill key={c.id} active={costume === c.id} onClick={() => setCostume(c.id)}>
                    {c.label}
                  </Pill>
                ))}
              </div>
              <button
                onClick={() => setSeed(`arc-session-${Math.floor(Math.random() * 1e6)}`)}
                className="mt-3 text-sm text-accent underline-offset-4 hover:underline"
              >
                ↻ New session (reroll the random look) — currently <b className="font-semibold">{resolvedCostume}</b>
              </button>
            </Section>
          </div>
        </div>

        {/* roaming demo */}
        <Section title="Roaming — Arcy goes where the work is" className="mt-10">
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={() => setTouring((t) => !t)}
              className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-2 px-3 py-1.5 text-sm text-body hover:text-ink"
            >
              {touring ? <Pause size={14} /> : <Play size={14} />}
              {touring ? 'Pause tour' : 'Auto-tour'}
            </button>
            <span className="text-sm text-muted">or click a panel:</span>
          </div>
          <div className="relative h-56 overflow-hidden rounded-2xl border border-hairline bg-surface-1">
            <div className="grid h-full grid-cols-4">
              {ZONES.map((z, i) => (
                <button
                  key={z.label}
                  onClick={() => {
                    setTouring(false)
                    setZone(i)
                  }}
                  className={`flex items-start justify-center border-r border-hairline pt-4 font-mono text-xs uppercase tracking-widest transition last:border-r-0 ${
                    zone === i ? 'bg-surface-2 text-accent' : 'text-muted hover:text-body'
                  }`}
                >
                  {z.label}
                </button>
              ))}
            </div>
            <motion.div
              className="pointer-events-none absolute bottom-0"
              style={{ width: '25%' }}
              animate={{ left: `${zone * 25}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 16 }}
            >
              <div className="flex justify-center">
                <Arcy activity={ZONES[zone].activity} costume={resolvedCostume} size={150} />
              </div>
            </motion.div>
          </div>
        </Section>

        {/* contact sheet — every activity at a glance */}
        <Section title="Every activity, at a glance" className="mt-10">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {ACTIVITIES.map((a) => (
              <div
                key={a.id}
                className="flex flex-col items-center rounded-xl border border-hairline bg-surface-1 pb-3 pt-1"
              >
                <Arcy activity={a.id} costume={resolvedCostume} size={130} />
                <span className="font-mono text-xs uppercase tracking-wider text-accent">{a.label}</span>
                <span className="mt-1 px-2 text-center text-[11px] text-muted">{ARCY_SAYS[a.id]}</span>
              </div>
            ))}
          </div>
        </Section>
      </main>
    </div>
  )
}

function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h2 className="mb-3 font-display text-lg tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

function Pill({
  active,
  glow,
  onClick,
  children,
}: {
  active: boolean
  glow?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
        active
          ? 'border-accent bg-accent-soft text-ink'
          : 'border-hairline bg-surface-1 text-body hover:border-accent/50 hover:text-ink'
      } ${glow && active ? 'shadow-[0_0_20px_rgba(96,165,250,0.5)]' : ''}`}
      style={glow ? { fontWeight: 600 } : undefined}
    >
      {children}
    </button>
  )
}

function RadialGlow() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background: 'radial-gradient(circle at 50% 45%, rgba(96,165,250,0.18), transparent 60%)',
      }}
    />
  )
}

function ArcMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <path d="M5 20 A 11 11 0 0 1 21 6" fill="none" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" />
      <circle cx="20" cy="19" r="3" fill="#60a5fa" />
    </svg>
  )
}
