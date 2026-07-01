import type { ReactElement } from 'react'
import type { PropName } from './types'

// Props Arcy holds in-hand. Each is drawn around its own origin (0,0) in a roughly
// 36×36 box; Arcy positions/rotates the whole group at the hand. Claymation-ish:
// solid base + a soft top highlight, rounded everything.

function Keyboard() {
  return (
    <g>
      <rect x={-17} y={-8} width={34} height={16} rx={3.5} fill="#2a2f3a" stroke="#3b4250" strokeWidth={1.5} />
      {[-12, -6, 0, 6, 12].map((x) => (
        <rect key={`a${x}`} x={x - 2} y={-5} width={4} height={4} rx={1} fill="#60a5fa" />
      ))}
      {[-9, -3, 3, 9].map((x) => (
        <rect key={`b${x}`} x={x - 2} y={1} width={4} height={4} rx={1} fill="#3b82f6" />
      ))}
      <rect x={-15} y={-7} width={30} height={2.5} rx={1.25} fill="#ffffff" opacity={0.14} />
    </g>
  )
}

function Laptop() {
  return (
    <g>
      {/* screen (tilted back), glowing with code */}
      <g transform="rotate(-7)">
        <rect x={-19} y={-25} width={38} height={21} rx={2.5} fill="#1f2530" stroke="#3b4250" strokeWidth={1} />
        <rect x={-15.5} y={-22} width={31} height={15} rx={1.5} fill="#0b1118" />
        <rect x={-12} y={-19} width={14} height={2} rx={1} fill="#60a5fa" />
        <rect x={-12} y={-15.5} width={21} height={2} rx={1} fill="#7fe7ff" opacity={0.85} />
        <rect x={-12} y={-12} width={9} height={2} rx={1} fill="#a78bfa" opacity={0.85} />
        <text x={6} y={-9.5} fontSize={5.5} fontWeight={700} fill="#7fe7ff" style={{ fontFamily: 'var(--font-mono)' }}>
          {'</>'}
        </text>
      </g>
      {/* keyboard deck (perspective) */}
      <path d="M-24 6 L24 6 L19 -3 L-19 -3 Z" fill="#2a2f3a" stroke="#3b4250" strokeWidth={1.2} />
      <path d="M-24 6 L24 6 L26 9.5 L-26 9.5 Z" fill="#1b2028" />
      <rect x={-15} y={-1} width={30} height={2} rx={1} fill="#454d5e" />
      <rect x={-5} y={2.5} width={10} height={3} rx={1.2} fill="#3b4250" />
    </g>
  )
}

function Wrench() {
  return (
    <g transform="rotate(-38)">
      <rect x={-3.5} y={-6} width={7} height={24} rx={3.5} fill="#b9c3d1" />
      <rect x={-2} y={-5} width={2} height={20} rx={1} fill="#ffffff" opacity={0.35} />
      <circle cx={0} cy={-13} r={9} fill="none" stroke="#b9c3d1" strokeWidth={5.5} />
      <rect x={-3.5} y={-21} width={7} height={7} fill="#0a0b0f" />
      <circle cx={0} cy={-13} r={9} fill="none" stroke="#ffffff" strokeWidth={1.5} opacity={0.25} />
    </g>
  )
}

function Magnifier() {
  return (
    <g>
      <rect x={3} y={4} width={8} height={16} rx={4} fill="#9aa6b6" transform="rotate(-45 7 12)" />
      <circle cx={-3} cy={-3} r={11} fill="rgba(150,210,255,0.30)" stroke="#dcecff" strokeWidth={3.5} />
      <path d="M -8 -7 A 7 7 0 0 1 -1 -10" stroke="#ffffff" strokeWidth={2.5} fill="none" strokeLinecap="round" opacity={0.8} />
    </g>
  )
}

function Telescope() {
  return (
    <g transform="rotate(-28)">
      <rect x={-16} y={-6} width={16} height={12} rx={6} fill="#c9a24b" />
      <rect x={-2} y={-7.5} width={18} height={15} rx={7.5} fill="#dcb968" />
      <rect x={14} y={-7.5} width={4} height={15} rx={2} fill="#8a6f2e" />
      <rect x={-14} y={-5} width={26} height={2.5} rx={1.25} fill="#ffffff" opacity={0.3} />
    </g>
  )
}

function Clipboard() {
  return (
    <g>
      <rect x={-13} y={-15} width={26} height={31} rx={3} fill="#eef3fa" stroke="#cdd7e5" strokeWidth={1.5} />
      <rect x={-6} y={-18} width={12} height={6} rx={2} fill="#9aa6b6" />
      {[-7, -1, 5].map((y) => (
        <rect key={y} x={-8} y={y} width={16} height={2.4} rx={1.2} fill="#60a5fa" opacity={0.7} />
      ))}
      <rect x={-8} y={11} width={9} height={2.4} rx={1.2} fill="#9aa6b6" />
    </g>
  )
}

function Extinguisher() {
  return (
    <g>
      <rect x={-7} y={-9} width={14} height={22} rx={6} fill="#e0453f" />
      <rect x={-4.5} y={-8} width={3} height={18} rx={1.5} fill="#ffffff" opacity={0.3} />
      <rect x={-4} y={-15} width={8} height={7} rx={2} fill="#1f2530" />
      <path d="M 4 -13 q 9 -2 8 6" stroke="#1f2530" strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <rect x={-6} y={2} width={12} height={5} rx={1} fill="#ffffff" opacity={0.85} />
    </g>
  )
}

function Gauntlet() {
  return (
    <g>
      <circle r={14} fill="#a78bfa" opacity={0.25} />
      <circle r={11} fill="#22d3ee" opacity={0.4} />
      <circle r={9} fill="#60a5fa" />
      {[-5, 0, 5].map((x) => (
        <circle key={x} cx={x} cy={-4} r={2.6} fill="#eafbff" />
      ))}
      <circle cx={0} cy={3} r={2.4} fill="#f472b6" />
      <circle cx={-3} cy={-3} r={1.5} fill="#ffffff" />
    </g>
  )
}

const COMPONENTS: Record<PropName, () => ReactElement> = {
  keyboard: Keyboard,
  laptop: Laptop,
  wrench: Wrench,
  magnifier: Magnifier,
  telescope: Telescope,
  clipboard: Clipboard,
  extinguisher: Extinguisher,
  gauntlet: Gauntlet,
}

export function ArcyProp({ name }: { name: PropName }) {
  const C = COMPONENTS[name]
  return <C />
}
