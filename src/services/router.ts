import { type ArcModelId, ARC_MODELS } from '../config/providers'
import { effortConfig, type EffortLevel } from './effort'

export interface RouteInput {
  text: string
  hasImage?: boolean
  effort: EffortLevel
  /** Manual pin from the user. When set, routing always honours it. */
  override?: ArcModelId | null
  /** Previously-active model (to detect a switch). */
  prev?: ArcModelId
}

export interface RouteResult {
  model: ArcModelId
  /** Short, provider-agnostic reason for the choice. */
  reason: string
  /** True when this differs from `prev`. */
  switched: boolean
  /** UI announcement when switched (else undefined). */
  announce?: string
}

/** Decide which model handles a turn. Pure function — the store wires events. */
export function routeModel(input: RouteInput): RouteResult {
  const prev = input.prev
  const decide = (): { model: ArcModelId; reason: string } => {
    // Arc3Mini can't see images — force Arc3Ultra regardless of the pin (capability).
    if (input.hasImage && input.override !== 'arc3ultra') return { model: 'arc3ultra', reason: 'image input' }
    // The user chooses the model explicitly (no auto-routing).
    if (input.override) return { model: input.override, reason: 'pinned by you' }
    // Fallback only (override is normally always set).
    const e = effortConfig(input.effort)
    if (e.supercode || e.forcesUltra) return { model: 'arc3ultra', reason: e.supercode ? 'SUPERCODE' : `${e.label} effort` }
    return { model: 'arc3mini', reason: 'default' }
  }

  const { model, reason } = decide()
  const switched = !!prev && prev !== model
  // Only announce capability-forced switches (e.g. image input) — not the user's own pin.
  const announce = switched && reason !== 'pinned by you' ? `⚡ Switched to ${ARC_MODELS[model].label} · ${reason}` : undefined
  return { model, reason, switched, announce }
}
