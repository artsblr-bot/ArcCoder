import { useId, type ReactNode } from 'react'
import {
  motion,
  useReducedMotion,
  type Variants,
  type TargetAndTransition,
  type Transition,
} from 'framer-motion'
import type { ArcyActivity, ArcyMood, PropName } from './types'
import { MOOD_FOR_ACTIVITY, PROP_FOR_ACTIVITY } from './types'
import { ArcyProp } from './props'
import { CostumeLayer, type CostumeId } from './costumes'

export interface ArcyProps {
  activity?: ArcyActivity
  costume?: CostumeId
  mood?: ArcyMood
  size?: number
  className?: string
  /** Where the eyes point, normalized −1..1 (e.g. toward the mouse). */
  look?: { x: number; y: number }
  /** Playful face — Arcy grinning as it plays catch with the cursor. */
  playful?: boolean
}

const ARM_OUTLINE = '#9a4f30'
const INK = '#3a2416'

// Whole-body choreography per activity. transformOrigin is the feet, so squash and
// jumps feel grounded.
const EASE = [0.4, 0, 0.2, 1] as const

// 2D body life — smooth float + grounded squash. The 3D turn lives on the wrapper.
const bodyVariants: Variants = {
  idle: { y: [0, -6, 0], scaleY: [1, 1.015, 1], transition: { duration: 3.6, repeat: Infinity, ease: EASE } },
  thinking: { y: [0, -3, 0], transition: { duration: 3, repeat: Infinity, ease: EASE } },
  coding: { y: [0, -1.5, 0], transition: { duration: 1.1, repeat: Infinity, ease: EASE } },
  building: { y: [0, -2, 0], transition: { duration: 0.8, repeat: Infinity, ease: EASE } },
  researching: { y: [0, -3, 0], transition: { duration: 2.6, repeat: Infinity, ease: EASE } },
  planning: { y: [0, -2, 0], transition: { duration: 2.6, repeat: Infinity, ease: EASE } },
  fixing: { x: [0, -3.5, 2.5, 0], transition: { duration: 1, repeat: Infinity, ease: EASE } },
  pulling: { x: [0, -3, 0], rotate: [-5, -8, -5], transition: { duration: 0.8, repeat: Infinity, ease: EASE } },
  success: { y: [0, -22, 0], scaleY: [1, 1.06, 0.95, 1], transition: { duration: 1.05, repeat: Infinity, ease: EASE } },
  overdrive: { y: [0, -10, 0], scale: [1, 1.03, 1], transition: { duration: 1.3, repeat: Infinity, ease: EASE } },
}

// Smaller, smoother limb motion — no jerky big swings.
const armAnim: Partial<Record<ArcyActivity, { animate: TargetAndTransition; transition: Transition }>> = {
  coding: { animate: { rotate: [0, -4, 0] }, transition: { duration: 0.5, repeat: Infinity, ease: EASE } },
  building: { animate: { rotate: [-4, 15, -4] }, transition: { duration: 0.75, repeat: Infinity, ease: EASE } },
  planning: { animate: { rotate: [0, 5, 0] }, transition: { duration: 0.8, repeat: Infinity, ease: EASE } },
  pulling: { animate: { rotate: [0, -8, 0] }, transition: { duration: 0.8, repeat: Infinity, ease: EASE } },
  overdrive: { animate: { rotate: [-3, 4, -3] }, transition: { duration: 0.6, repeat: Infinity, ease: EASE } },
}

// Gentle 3D turn applied to the whole creature so he reads as a volume, not a sticker.
function wrapper3D(activity: ArcyActivity): { animate: TargetAndTransition; transition: Transition } {
  switch (activity) {
    case 'idle':
      return { animate: { rotateY: [-11, 11, -11], rotateX: [3, -2, 3] }, transition: { duration: 7, repeat: Infinity, ease: EASE } }
    case 'thinking':
      return { animate: { rotateY: [-13, 5, -13], rotateX: [2, -3, 2] }, transition: { duration: 5.5, repeat: Infinity, ease: EASE } }
    case 'coding':
      // biased to his right, toward the laptop — a steady 3/4 view
      return { animate: { rotateY: [10, 17, 10] }, transition: { duration: 3.2, repeat: Infinity, ease: EASE } }
    case 'overdrive':
      return { animate: { rotateY: [-15, 15, -15] }, transition: { duration: 1.8, repeat: Infinity, ease: EASE } }
    case 'success':
      return { animate: { rotateY: [-8, 8, -8] }, transition: { duration: 1.05, repeat: Infinity, ease: EASE } }
    default:
      return { animate: { rotateY: [-8, 8, -8] }, transition: { duration: 5.5, repeat: Infinity, ease: EASE } }
  }
}

export function Arcy({ activity = 'idle', costume = 'none', mood, size = 220, className, look, playful }: ArcyProps) {
  const raw = useId()
  const uid = raw.replace(/[^a-zA-Z0-9]/g, '')
  const reduce = useReducedMotion()
  const m = mood ?? MOOD_FOR_ACTIVITY[activity]
  // Playful keeps round, tracking eyes (so they follow the cursor) with a big grin.
  const faceMood: ArcyMood = playful ? 'happy' : m
  const prop = PROP_FOR_ACTIVITY[activity]
  const happyArcEyes = !playful && (m === 'joy' || m === 'excited')

  const armColor = `url(#${uid}-arm)`
  const Arm = (sx: number, sy: number, hx: number, hy: number, anim?: ArcyActivity) => {
    const a = anim ? armAnim[anim] : undefined
    const cx = (sx + hx) / 2 + (hx > 100 ? 10 : -10)
    const cy = (sy + hy) / 2 - 8
    const d = `M${sx} ${sy} Q ${cx} ${cy} ${hx} ${hy}`
    return (
      <motion.g
        style={{ transformBox: 'fill-box', transformOrigin: `${sx}px ${sy}px` }}
        animate={reduce ? undefined : a?.animate}
        transition={a?.transition}
      >
        <path d={d} stroke={ARM_OUTLINE} strokeWidth={18} strokeLinecap="round" fill="none" />
        <path d={d} stroke={armColor} strokeWidth={13} strokeLinecap="round" fill="none" />
        <circle cx={hx} cy={hy} r={11.5} fill={armColor} stroke={ARM_OUTLINE} strokeWidth={2} />
        <circle cx={hx - 3} cy={hy - 4} r={3.2} fill="#ffffff" opacity={0.35} />
      </motion.g>
    )
  }

  const w3d = wrapper3D(activity)
  return (
    <motion.div
      className={className}
      style={{ display: 'inline-block', lineHeight: 0, transformPerspective: 900, transformStyle: 'preserve-3d' }}
      animate={reduce ? undefined : w3d.animate}
      transition={w3d.transition}
    >
      <svg
        viewBox="0 0 200 232"
        width={size}
        height={(size * 232) / 200}
        role="img"
        aria-label={`Arcy, ${activity}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
      <defs>
        <radialGradient id={`${uid}-body`} cx="0.4" cy="0.3" r="0.95">
          <stop offset="0" stopColor="#ffe7d4" />
          <stop offset="0.5" stopColor="#f6b48a" />
          <stop offset="0.82" stopColor="#e3814f" />
          <stop offset="1" stopColor="#b9582f" />
        </radialGradient>
        <radialGradient id={`${uid}-belly`} cx="0.5" cy="0.42" r="0.7">
          <stop offset="0" stopColor="#fff4ea" />
          <stop offset="1" stopColor="#f7cba6" />
        </radialGradient>
        <radialGradient id={`${uid}-arm`} cx="0.4" cy="0.3" r="0.9">
          <stop offset="0" stopColor="#ffd8bf" />
          <stop offset="1" stopColor="#df8b5d" />
        </radialGradient>
        <linearGradient id={`${uid}-tuft`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff7ec" />
          <stop offset="0.5" stopColor="#ffce82" />
          <stop offset="1" stopColor="#f0892f" />
        </linearGradient>
        <filter id={`${uid}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`${uid}-soft`} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#0a1830" floodOpacity="0.45" />
        </filter>
        <linearGradient id={`${uid}-spectrum`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="0.33" stopColor="#22d3ee" />
          <stop offset="0.66" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
      </defs>

      {/* contact shadow */}
      <motion.ellipse
        cx={100}
        cy={216}
        rx={50}
        ry={9}
        fill="#000000"
        initial={{ opacity: 0.32, scaleX: 1 }}
        animate={reduce ? undefined : { opacity: [0.32, 0.24, 0.32], scaleX: [1, 0.9, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ filter: 'blur(3px)', transformBox: 'fill-box', transformOrigin: 'center' }}
      />

      {/* ambient glow */}
      <motion.circle
        cx={100}
        cy={120}
        r={78}
        fill="#cc785c"
        opacity={0.14}
        filter={`url(#${uid}-glow)`}
        animate={reduce ? undefined : { opacity: activity === 'overdrive' ? [0.22, 0.42, 0.22] : [0.1, 0.16, 0.1] }}
        transition={{ duration: activity === 'overdrive' ? 1 : 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      {activity === 'overdrive' && (
        <motion.circle
          cx={100}
          cy={120}
          r={94}
          fill="none"
          stroke={`url(#${uid}-spectrum)`}
          strokeWidth={4}
          strokeDasharray="10 14"
          opacity={0.85}
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />
      )}

      <motion.g
        variants={bodyVariants}
        animate={reduce ? undefined : activity}
        style={{ transformBox: 'fill-box', transformOrigin: '50% 90%' }}
      >
        {/* body */}
        <path
          d="M100 66 C 60 66, 40 96, 40 132 C 40 170, 66 192, 100 192 C 134 192, 160 170, 160 132 C 160 96, 140 66, 100 66 Z"
          fill={`url(#${uid}-body)`}
          filter={`url(#${uid}-soft)`}
          stroke="#b9582f"
          strokeWidth={1.5}
        />
        <ellipse cx={100} cy={150} rx={38} ry={36} fill={`url(#${uid}-belly)`} opacity={0.85} />
        <ellipse cx={76} cy={98} rx={20} ry={13} fill="#ffffff" opacity={0.5} style={{ filter: 'blur(2px)' }} />
        <ellipse cx={70} cy={134} rx={9} ry={6} fill="#e07a52" opacity={0.4} />
        <ellipse cx={130} cy={134} rx={9} ry={6} fill="#e07a52" opacity={0.4} />

        {/* tuft */}
        <motion.g
          animate={reduce ? undefined : { opacity: [0.85, 1, 0.85], scaleY: [1, 1.08, 1] }}
          transition={{ duration: activity === 'thinking' || activity === 'overdrive' ? 0.5 : 1.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformBox: 'fill-box', transformOrigin: '100px 76px' }}
          filter={`url(#${uid}-glow)`}
        >
          <path d="M100 40 C 110 58, 105 66, 100 78 C 95 66, 90 58, 100 40 Z" fill={`url(#${uid}-tuft)`} />
          <path d="M114 52 C 118 62, 115 67, 110 73 C 110 64, 109 58, 114 52 Z" fill={`url(#${uid}-tuft)`} opacity={0.9} />
        </motion.g>

        {/* face */}
        <FaceBrows mood={faceMood} />
        {happyArcEyes ? (
          <>
            <path d="M72 116 q10 -11 20 0" stroke={INK} strokeWidth={4} fill="none" strokeLinecap="round" />
            <path d="M108 116 q10 -11 20 0" stroke={INK} strokeWidth={4} fill="none" strokeLinecap="round" />
          </>
        ) : (
          <motion.g
            animate={reduce || playful ? undefined : { scaleY: [1, 1, 0.1, 1] }}
            transition={{ duration: 4.2, repeat: Infinity, times: [0, 0.92, 0.96, 1], ease: 'easeInOut' }}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          >
            <Eye cx={82} mood={faceMood} look={look} wide={playful} />
            <Eye cx={118} mood={faceMood} look={look} wide={playful} />
          </motion.g>
        )}
        <Mouth mood={faceMood} />

        <CostumeLayer id={costume} />

        {renderHands(activity, prop, Arm)}
        <ActivityFX activity={activity} uid={uid} reduce={!!reduce} />
      </motion.g>
      </svg>
    </motion.div>
  )
}

function Eye({ cx, mood, look, wide }: { cx: number; mood: ArcyMood; look?: { x: number; y: number }; wide?: boolean }) {
  const baseY = mood === 'focused' || mood === 'determined' ? 3 : mood === 'curious' ? -1 : 1
  const ry = wide ? 15.5 : mood === 'strain' ? 8 : 13.5
  const cy = mood === 'strain' ? 119 : 116
  const px = (look?.x ?? 0) * 4
  const py = (look?.y ?? 0) * 4
  const pr = wide ? 5 : mood === 'strain' ? 4.5 : 6.2
  const pcx = cx + px
  const pcy = cy + baseY + py
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={12} ry={ry} fill="#fbfeff" />
      <ellipse cx={cx} cy={cy} rx={12} ry={ry} fill="none" stroke="#e6d3c0" strokeWidth={1} />
      <circle cx={pcx} cy={pcy} r={pr} fill={INK} />
      <circle cx={pcx - 2.2} cy={pcy - 3} r={2} fill="#ffffff" />
    </g>
  )
}

function FaceBrows({ mood }: { mood: ArcyMood }) {
  if (mood === 'worried')
    return (
      <g stroke={INK} strokeWidth={3} strokeLinecap="round">
        <line x1={72} y1={99} x2={90} y2={95} />
        <line x1={128} y1={99} x2={110} y2={95} />
      </g>
    )
  if (mood === 'strain')
    return (
      <g stroke={INK} strokeWidth={3.4} strokeLinecap="round">
        <line x1={71} y1={95} x2={91} y2={101} />
        <line x1={129} y1={95} x2={109} y2={101} />
      </g>
    )
  if (mood === 'determined' || mood === 'focused')
    return (
      <g stroke={INK} strokeWidth={3} strokeLinecap="round">
        <line x1={72} y1={97} x2={90} y2={99} />
        <line x1={128} y1={97} x2={110} y2={99} />
      </g>
    )
  if (mood === 'curious')
    return (
      <g stroke={INK} strokeWidth={3} strokeLinecap="round" fill="none">
        <path d="M72 95 q9 -5 18 -1" />
        <path d="M128 95 q-9 -5 -18 -1" />
      </g>
    )
  return null
}

function Mouth({ mood }: { mood: ArcyMood }) {
  switch (mood) {
    case 'joy':
      return <path d="M86 144 q14 20 28 0 q-14 8 -28 0 Z" fill={INK} />
    case 'excited':
      return (
        <g>
          <ellipse cx={100} cy={150} rx={9} ry={8} fill={INK} />
          <ellipse cx={100} cy={154} rx={5} ry={3} fill="#ff7a9c" />
        </g>
      )
    case 'happy':
      return <path d="M84 146 q16 15 32 0" stroke={INK} strokeWidth={3.5} fill="none" strokeLinecap="round" />
    case 'worried':
      return <path d="M88 153 q12 -8 24 0" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />
    case 'strain':
      // gritted teeth
      return (
        <g>
          <rect x={88} y={147} width={24} height={9} rx={2.5} fill={INK} />
          <line x1={94} y1={147} x2={94} y2={156} stroke="#fbfeff" strokeWidth={1.4} />
          <line x1={100} y1={147} x2={100} y2={156} stroke="#fbfeff" strokeWidth={1.4} />
          <line x1={106} y1={147} x2={106} y2={156} stroke="#fbfeff" strokeWidth={1.4} />
        </g>
      )
    case 'determined':
      return <path d="M90 150 q10 5 20 -1" stroke={INK} strokeWidth={3.2} fill="none" strokeLinecap="round" />
    case 'focused':
      return <line x1={93} y1={150} x2={107} y2={150} stroke={INK} strokeWidth={3} strokeLinecap="round" />
    case 'curious':
      return <ellipse cx={100} cy={150} rx={5} ry={6} fill={INK} />
    default:
      return <path d="M88 148 q12 11 24 0" stroke={INK} strokeWidth={3.2} fill="none" strokeLinecap="round" />
  }
}

type ArmFn = (sx: number, sy: number, hx: number, hy: number, anim?: ArcyActivity) => ReactNode

function Held({ name, x, y, scale = 1, rotate = 0 }: { name: PropName; x: number; y: number; scale?: number; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale}) rotate(${rotate})`}>
      <ArcyProp name={name} />
    </g>
  )
}

function renderHands(activity: ArcyActivity, prop: PropName | null, Arm: ArmFn): ReactNode {
  switch (activity) {
    case 'coding':
      // big laptop off to his extreme right at medium height; he reaches over and types on it
      return (
        <>
          {prop && <Held name={prop} x={156} y={126} scale={1.25} rotate={-5} />}
          {Arm(54, 142, 130, 140, 'coding')}
          {Arm(146, 142, 150, 132, 'coding')}
        </>
      )
    case 'building':
      return (
        <>
          {Arm(54, 142, 56, 166)}
          {Arm(146, 142, 150, 92, 'building')}
          {prop && <Held name={prop} x={150} y={80} scale={1.4} />}
        </>
      )
    case 'researching':
      return (
        <>
          {Arm(54, 142, 56, 166)}
          {Arm(146, 142, 130, 128)}
          {prop && <Held name={prop} x={120} y={110} scale={1.7} />}
        </>
      )
    case 'planning':
      return (
        <>
          {prop && <Held name={prop} x={98} y={150} scale={1.35} />}
          {Arm(54, 142, 76, 152)}
          {Arm(146, 142, 116, 142, 'planning')}
        </>
      )
    case 'fixing':
      return (
        <>
          {Arm(54, 142, 84, 162)}
          {Arm(146, 142, 110, 150)}
          {prop && <Held name={prop} x={98} y={154} scale={1.25} rotate={-12} />}
        </>
      )
    case 'pulling':
      return (
        <>
          {Arm(54, 142, 168, 120, 'pulling')}
          {Arm(146, 142, 170, 150, 'pulling')}
          {/* the "panel edge" Arcy is heaving open */}
          <rect x={172} y={104} width={10} height={62} rx={3} fill="#1e222b" stroke="#3a4150" strokeWidth={1.5} />
        </>
      )
    case 'success':
      return (
        <>
          {Arm(54, 142, 48, 90)}
          {Arm(146, 142, 152, 90)}
        </>
      )
    case 'overdrive':
      return (
        <>
          {Arm(54, 142, 56, 102)}
          {Arm(146, 142, 150, 88, 'overdrive')}
          {prop && <Held name={prop} x={150} y={82} scale={1.4} />}
        </>
      )
    case 'thinking':
      return (
        <>
          {Arm(54, 142, 56, 166)}
          {Arm(146, 142, 110, 150)}
        </>
      )
    default:
      return (
        <>
          {Arm(54, 142, 50, 166)}
          {Arm(146, 142, 150, 166)}
        </>
      )
  }
}

// ── Per-activity FX: the layer that makes each action unmistakable ──────────────
function Sweat({ x, y, delay = 0, big = false }: { x: number; y: number; delay?: number; big?: boolean }) {
  const s = big ? 1.4 : 1
  return (
    <motion.path
      d={`M0 -6 q-4 6 0 9 q4 -3 0 -9 Z`}
      transform={`translate(${x} ${y}) scale(${s})`}
      fill="#9fe0ff"
      stroke="#5ab6ef"
      strokeWidth={0.6}
      initial={{ opacity: 0 }}
      animate={{ y: [0, 14], opacity: [0, 1, 0] }}
      transition={{ duration: 0.9, repeat: Infinity, delay, ease: 'easeIn' }}
      style={{ transformBox: 'fill-box' }}
    />
  )
}

function FxText({ x, y, children, color = '#5db8a6', size = 15, dy = 8 }: { x: number; y: number; children: string; color?: string; size?: number; dy?: number }) {
  return (
    <motion.text
      x={x}
      y={y}
      fill={color}
      fontSize={size}
      fontWeight={700}
      textAnchor="middle"
      style={{ fontFamily: 'var(--font-mono)' }}
      animate={{ y: [y, y - dy, y], opacity: [0.3, 1, 0.3] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      {children}
    </motion.text>
  )
}

function ActivityFX({ activity, uid, reduce }: { activity: ArcyActivity; uid: string; reduce: boolean }) {
  switch (activity) {
    case 'thinking':
      return (
        <g>
          <circle cx={130} cy={84} r={3} fill="#ffffff" opacity={0.85} />
          <circle cx={138} cy={74} r={4.5} fill="#ffffff" opacity={0.9} />
          <ellipse cx={154} cy={56} rx={17} ry={13} fill="#ffffff" opacity={0.95} />
          <text x={154} y={61} fontSize={17} fontWeight={800} textAnchor="middle" fill="#3b82f6" style={{ fontFamily: 'var(--font-mono)' }}>
            ?
          </text>
        </g>
      )
    case 'coding':
      // key-press sparks rising off the laptop deck (out to his right)
      return reduce ? null : (
        <g>
          <motion.rect x={150} y={124} width={5} height={5} rx={1} fill="#fff3e0" animate={{ y: [124, 112], opacity: [1, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} />
          <motion.rect x={168} y={126} width={5} height={5} rx={1} fill="#5db8a6" animate={{ y: [126, 112], opacity: [1, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }} />
        </g>
      )
    case 'building':
      return (
        <g>
          {!reduce && <Sweat x={122} y={92} />}
          {!reduce && (
            <motion.path
              d="M150 70 l2 6 6 1 -5 4 2 6 -5 -4 -5 4 2 -6 -5 -4 6 -1 z"
              fill="#fde68a"
              animate={{ scale: [0, 1.3, 0], opacity: [0, 1, 0] }}
              transition={{ duration: 0.5, repeat: Infinity, ease: 'easeOut' }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
          )}
        </g>
      )
    case 'researching':
      return (
        <g>
          {!reduce && (
            <motion.g animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}>
              <line x1={108} y1={104} x2={150} y2={86} stroke="#5db8a6" strokeWidth={2} strokeDasharray="3 4" />
              <line x1={110} y1={116} x2={156} y2={116} stroke="#5db8a6" strokeWidth={2} strokeDasharray="3 4" />
            </motion.g>
          )}
          <motion.path
            d="M132 96 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 z"
            fill="#fff3e0"
            animate={reduce ? undefined : { scale: [0.6, 1.2, 0.6], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1, repeat: Infinity }}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          />
        </g>
      )
    case 'planning':
      return (
        <g>
          {[0, 1].map((i) => (
            <motion.path
              key={i}
              d={`M104 ${139 + i * 12} l3 4 6 -8`}
              stroke="#34d399"
              strokeWidth={2.6}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: [0, 1, 1, 0], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.5 }}
            />
          ))}
        </g>
      )
    case 'fixing':
      return (
        <g>
          {/* alert */}
          <motion.g animate={reduce ? undefined : { y: [0, -3, 0] }} transition={{ duration: 0.6, repeat: Infinity }}>
            <path d="M100 40 L112 60 L88 60 Z" fill="#f87171" stroke="#ffffff" strokeWidth={1.5} strokeLinejoin="round" />
            <rect x={98.5} y={48} width={3} height={6} rx={1.5} fill="#ffffff" />
            <circle cx={100} cy={57} r={1.6} fill="#ffffff" />
          </motion.g>
          {!reduce && <Sweat x={126} y={96} />}
          {!reduce && <Sweat x={74} y={100} delay={0.4} />}
          {/* extinguisher puff */}
          {!reduce && (
            <motion.circle cx={112} cy={138} r={6} fill="#ffffff" animate={{ scale: [0, 1.6], opacity: [0.8, 0] }} transition={{ duration: 0.8, repeat: Infinity }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
          )}
        </g>
      )
    case 'pulling':
      return (
        <g>
          {!reduce && <Sweat x={120} y={92} big />}
          {!reduce && <Sweat x={78} y={96} delay={0.3} big />}
          {/* strain marks */}
          <g stroke="#9fe0ff" strokeWidth={2} strokeLinecap="round" opacity={0.7}>
            <line x1={150} y1={108} x2={158} y2={104} />
            <line x1={152} y1={150} x2={160} y2={154} />
          </g>
        </g>
      )
    case 'success':
      return (
        <g>
          <motion.g
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.2, 1] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 0.4 }}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          >
            <circle cx={140} cy={78} r={12} fill="#34d399" />
            <path d="M134 78 l4 5 8 -10" stroke="#ffffff" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </motion.g>
          {[
            { x: 50, y: 70 },
            { x: 150, y: 110 },
            { x: 100, y: 44 },
            { x: 38, y: 120 },
          ].map((p, i) => (
            <motion.path
              key={i}
              d={`M${p.x} ${p.y - 7} l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z`}
              fill="#fff3e0"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.2, 0], opacity: [0, 1, 0] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.12, ease: 'easeOut' }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
          ))}
        </g>
      )
    case 'overdrive':
      return (
        <g>
          {[
            { x: 46, y: 96, c: '#22d3ee' },
            { x: 156, y: 110, c: '#a78bfa' },
            { x: 100, y: 40, c: '#f472b6' },
          ].map((b, i) => (
            <motion.path
              key={i}
              d={`M${b.x} ${b.y} l6 -10 -3 8 7 -2 -8 12 3 -8 -6 2 z`}
              fill={b.c}
              animate={reduce ? undefined : { opacity: [0, 1, 0], scale: [0.7, 1.2, 0.7] }}
              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.18 }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
          ))}
          <FxText x={100} y={36} color={`#a78bfa`} size={11} dy={4}>
            SUPERCODE
          </FxText>
          <rect width="0" height="0" fill={`url(#${uid}-spectrum)`} />
        </g>
      )
    default:
      return null
  }
}
