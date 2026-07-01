import type { ReactElement } from 'react'

// Themed costume sets. One is chosen per session (seeded by session id) so Arcy
// shows up dressed differently each time. Coordinates align with Arcy's rig:
// head centre ≈ (100, 108), crown ≈ (100, 74), shoulders ≈ y 150.

export type CostumeId =
  | 'none'
  | 'builder'
  | 'explorer'
  | 'wizard'
  | 'astronaut'
  | 'scientist'
  | 'ninja'

export interface Costume {
  id: CostumeId
  label: string
}

export const COSTUMES: Costume[] = [
  { id: 'builder', label: 'Builder' },
  { id: 'explorer', label: 'Explorer' },
  { id: 'wizard', label: 'Wizard' },
  { id: 'astronaut', label: 'Astronaut' },
  { id: 'scientist', label: 'Scientist' },
  { id: 'ninja', label: 'Ninja' },
]

const THEMED = COSTUMES.map((c) => c.id)

/** Deterministic per-session costume so Arcy is stable within a session, fresh next. */
export function pickCostume(seed: string): CostumeId {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return THEMED[(h >>> 0) % THEMED.length]
}

function Builder() {
  return (
    <g>
      {/* tool belt */}
      <rect x={58} y={158} width={84} height={12} rx={4} fill="#8a5a22" />
      <rect x={92} y={158} width={16} height={12} rx={2} fill="#d9a441" />
      {/* hard hat */}
      <path d="M62 92 a38 32 0 0 1 76 0 z" fill="#f4b400" />
      <rect x={54} y={89} width={92} height={9} rx={4.5} fill="#e0a100" />
      <rect x={96} y={62} width={8} height={20} rx={3} fill="#e0a100" />
      <path d="M70 86 a30 24 0 0 1 28 -22" stroke="#ffffff" strokeWidth={3} fill="none" opacity={0.4} strokeLinecap="round" />
    </g>
  )
}

function Explorer() {
  return (
    <g>
      {/* satchel strap */}
      <path d="M60 120 L140 168" stroke="#7a5a3a" strokeWidth={8} strokeLinecap="round" />
      {/* pith helmet */}
      <ellipse cx={100} cy={92} rx={48} ry={9} fill="#b9a06a" />
      <path d="M66 92 a34 30 0 0 1 68 0 z" fill="#cdb479" />
      <rect x={96} y={60} width={8} height={16} rx={3} fill="#a98f56" />
      <path d="M72 86 a28 22 0 0 1 26 -20" stroke="#ffffff" strokeWidth={3} fill="none" opacity={0.4} strokeLinecap="round" />
    </g>
  )
}

function Wizard() {
  return (
    <g>
      {/* star collar */}
      <path d="M70 150 L100 162 L130 150 L122 172 L78 172 Z" fill="#3b2f7a" />
      {/* pointed hat */}
      <path d="M100 26 L66 90 L134 90 Z" fill="#4334a0" />
      <ellipse cx={100} cy={90} rx={40} ry={8} fill="#5a49c4" />
      <circle cx={100} cy={26} r={4} fill="#fcd34d" />
      <path d="M92 60 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="#fcd34d" />
      <circle cx={112} cy={74} r={2} fill="#fcd34d" />
      <circle cx={86} cy={78} r={1.6} fill="#fcd34d" />
    </g>
  )
}

function Astronaut() {
  return (
    <g>
      {/* helmet glass over the head (face shows through) */}
      <circle cx={100} cy={106} r={50} fill="rgba(190,225,255,0.16)" stroke="#d7e6f5" strokeWidth={5} />
      <path d="M70 84 a44 44 0 0 1 24 -20" stroke="#ffffff" strokeWidth={5} fill="none" opacity={0.5} strokeLinecap="round" />
      {/* chest pack */}
      <rect x={84} y={156} width={32} height={14} rx={3} fill="#e7edf5" />
      <circle cx={92} cy={163} r={2.4} fill="#34d399" />
      <circle cx={100} cy={163} r={2.4} fill="#fbbf24" />
      <circle cx={108} cy={163} r={2.4} fill="#f87171" />
    </g>
  )
}

function Scientist() {
  return (
    <g>
      {/* lab-coat lapels */}
      <path d="M78 150 L92 156 L86 178 L74 174 Z" fill="#f4f7fb" />
      <path d="M122 150 L108 156 L114 178 L126 174 Z" fill="#f4f7fb" />
      {/* round glasses */}
      <circle cx={80} cy={118} r={13} fill="rgba(255,255,255,0.12)" stroke="#e7edf5" strokeWidth={3} />
      <circle cx={120} cy={118} r={13} fill="rgba(255,255,255,0.12)" stroke="#e7edf5" strokeWidth={3} />
      <rect x={92} y={116} width={16} height={3.5} rx={1.75} fill="#e7edf5" />
    </g>
  )
}

function Ninja() {
  return (
    <g>
      {/* lower-face mask */}
      <path d="M64 124 q36 26 72 0 l0 18 q-36 22 -72 0 Z" fill="#1b2330" />
      {/* headband + tails */}
      <rect x={60} y={96} width={80} height={12} rx={3} fill="#1b2330" />
      <path d="M138 100 l22 -8 -4 12 16 2 -20 8 z" fill="#1b2330" />
      <rect x={70} y={99} width={60} height={3} rx={1.5} fill="#60a5fa" opacity={0.7} />
    </g>
  )
}

const LAYERS: Record<Exclude<CostumeId, 'none'>, () => ReactElement> = {
  builder: Builder,
  explorer: Explorer,
  wizard: Wizard,
  astronaut: Astronaut,
  scientist: Scientist,
  ninja: Ninja,
}

export function CostumeLayer({ id }: { id: CostumeId }) {
  if (id === 'none') return null
  const L = LAYERS[id]
  return <L />
}
