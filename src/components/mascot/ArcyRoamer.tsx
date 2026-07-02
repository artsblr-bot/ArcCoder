import { useEffect, useRef, useState } from 'react'
import { motion, useSpring, useReducedMotion } from 'framer-motion'
import { Arcy } from './Arcy'
import { useArc, type ArcyState } from '../../store/arc'
import { getPanelRect } from './panelRegistry'

const SIZE = 96

/** Arcy travels to the active panel while working; strolls to random spots while
 *  thinking/idle, watches the cursor, and bolts away (startled) if it gets too close. */
export function ArcyRoamer() {
  // Arcy's shown activity/target are driven through a DWELL QUEUE (below) rather than the
  // raw store value, so Arcy is actually *seen* working at each panel — even when the model
  // fires tools in a fast burst (m2.7 delivers a whole tool call in one chunk after a long
  // think), which otherwise flips the target away before the spring can arrive.
  const [disp, setDisp] = useState<ArcyState>(() => useArc.getState().arcy)
  const activity = disp.activity
  const target = disp.target
  const queueRef = useRef<ArcyState[]>([])
  const busyRef = useRef(false)
  const costume = useArc((s) => s.costume)
  const view = useArc((s) => s.view)
  const reduce = useReducedMotion()

  // Every setArcy change is queued and shown for a minimum dwell so quick tools
  // (read_file→explorer, search→agent, …) are visible, not just write/terminal.
  useEffect(() => {
    const drain = () => {
      if (busyRef.current) return
      const next = queueRef.current.shift()
      if (!next) return
      busyRef.current = true
      setDisp(next)
      const rest = next.activity === 'idle' || next.activity === 'thinking'
      // Work states dwell so Arcy is seen there; rest states don't block; drain faster when backed up.
      const hold = rest ? 140 : queueRef.current.length > 3 ? 320 : 820
      window.setTimeout(() => {
        busyRef.current = false
        drain()
      }, hold)
    }
    const unsub = useArc.subscribe((state, prev) => {
      if (state.arcy !== prev.arcy) {
        queueRef.current.push(state.arcy)
        drain()
      }
    })
    return unsub
  }, [])

  const startX = typeof window !== 'undefined' ? window.innerWidth - SIZE - 24 : 0
  const x = useSpring(startX, { stiffness: 80, damping: 16, mass: 0.9 })
  const y = useSpring(140, { stiffness: 80, damping: 16, mass: 0.9 })
  const wanderRef = useRef({ x: startX, y: 140 })
  const mouseRef = useRef({ x: -99999, y: -99999 })
  const lookAtRef = useRef(0)
  const playTimer = useRef<number | undefined>(undefined)

  const [look, setLook] = useState({ x: 0, y: 0 })
  const [playful, setPlayful] = useState(false)

  const wander = !reduce && (activity === 'idle' || activity === 'thinking')

  const spot = (avoid?: { x: number; y: number }) => {
    const W = window.innerWidth
    const H = window.innerHeight
    for (let i = 0; i < 14; i++) {
      const rx = 48 + Math.random() * Math.max(80, W - SIZE - 96)
      const ry = 96 + Math.random() * Math.max(80, H - SIZE - 170)
      if (!avoid || Math.hypot(rx + SIZE / 2 - avoid.x, ry + SIZE / 2 - avoid.y) > 240) return { x: rx, y: ry }
    }
    return { x: W - SIZE - 40, y: 120 }
  }

  // Stroll: pick a fresh random spot every few seconds while wandering.
  useEffect(() => {
    if (view !== 'workspace' || !wander) return
    wanderRef.current = spot()
    const id = setInterval(() => {
      wanderRef.current = spot()
    }, 3600)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, wander])

  // Track the cursor; while wandering, bolt away + look startled if it gets close.
  useEffect(() => {
    if (view !== 'workspace') return
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
      if (!wander) return
      const cx = x.get() + SIZE / 2
      const cy = y.get() + SIZE / 2
      if (Math.hypot(e.clientX - cx, e.clientY - cy) < 135) {
        wanderRef.current = spot({ x: e.clientX, y: e.clientY })
        setPlayful(true)
        window.clearTimeout(playTimer.current)
        playTimer.current = window.setTimeout(() => setPlayful(false), 1100)
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.clearTimeout(playTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, wander])

  // Drive position (random spot vs. panel corner) and aim the eyes at the cursor.
  useEffect(() => {
    if (view !== 'workspace') return
    let raf = 0
    const tick = (t: number) => {
      if (wander) {
        x.set(wanderRef.current.x)
        y.set(wanderRef.current.y)
      } else {
        const r = getPanelRect(target)
        if (r) {
          x.set(r.left + r.width - SIZE - 6)
          y.set(r.top + 4)
        }
      }
      if (t - lookAtRef.current > 90 && mouseRef.current.x > -9999) {
        lookAtRef.current = t
        const cx = x.get() + SIZE / 2
        const cy = y.get() + SIZE / 2
        const nx = Math.max(-1, Math.min(1, (mouseRef.current.x - cx) / 220))
        const ny = Math.max(-1, Math.min(1, (mouseRef.current.y - cy) / 220))
        setLook((prev) => (Math.abs(prev.x - nx) > 0.06 || Math.abs(prev.y - ny) > 0.06 ? { x: nx, y: ny } : prev))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, wander, target])

  if (view !== 'workspace') return null

  return (
    <motion.div style={{ position: 'fixed', left: 0, top: 0, x, y, width: SIZE, zIndex: 45, pointerEvents: 'none' }}>
      <Arcy activity={activity} costume={costume} size={SIZE} look={look} playful={playful} />
    </motion.div>
  )
}
