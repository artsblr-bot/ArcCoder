// The two Arc models. The real provider/model ids live here and NOWHERE in the UI.
// Everything the user sees is "Arc3Mini" / "Arc3Ultra" by Arc Labs.

export type ArcModelId = 'arc3mini' | 'arc3ultra'
export type ArcProvider = 'zai' | 'nvidia'

/** OpenAI-compatible base paths (proxied via vite.config.ts / vercel.json). */
export const NIM_BASE = '/nvapi/v1'
export const ZAI_BASE = '/zai/api/paas/v4'

export interface ArcModel {
  id: ArcModelId
  label: string
  provider: ArcProvider
  /** Real upstream model id — hidden from the UI. */
  model: string
  base: string
  /** Exact window — internal use only (it fingerprints the real model). */
  contextWindow: number
  /** Abstracted, UI-safe context size. */
  contextLabel: string
  multimodal: boolean
  /** User-facing one-liner (no provider hints). */
  blurb: string
}

export const ARC_MODELS: Record<ArcModelId, ArcModel> = {
  arc3mini: {
    id: 'arc3mini',
    label: 'Arc3Mini',
    provider: 'zai',
    model: 'glm-4.7-flash',
    base: ZAI_BASE,
    contextWindow: 203_000,
    contextLabel: '~200K',
    multimodal: false,
    blurb: 'Fast and efficient — great for quick edits, answers, and small changes.',
  },
  arc3ultra: {
    id: 'arc3ultra',
    label: 'Arc3Ultra',
    provider: 'nvidia',
    // minimaxai/minimax-m3 went DEGRADED on NIM (400 "cannot be invoked"); m2.7 is the
    // healthy same-family drop-in (identical reasoning/API shape). Swap back if m3 recovers.
    model: 'minimaxai/minimax-m2.7',
    base: NIM_BASE,
    contextWindow: 204_800, // m2.7 is ~200K, NOT 1M like m3 — drives the meter + auto-compaction
    contextLabel: '~200K',
    multimodal: false, // m2.7 is text-only (m3 was multimodal); see VISION_MODEL below
    blurb: 'Deeper reasoning for big builds, refactors, and genuinely hard problems.',
  },
}

export const DEFAULT_MODEL: ArcModelId = 'arc3mini'

// The model to send image input to, if any is currently vision-capable — else null.
// Right now NO model is multimodal (Arc3Mini/GLM is text-only; Arc3Ultra/m2.7 is too),
// so image attach is hidden in the UI. Flip a model's `multimodal` flag and this — plus
// the composer's attach button and the router's image routing — re-enables automatically.
export const VISION_MODEL: ArcModelId | null =
  (Object.keys(ARC_MODELS) as ArcModelId[]).find((id) => ARC_MODELS[id].multimodal) ?? null
export const HAS_VISION = VISION_MODEL !== null

export function arcModel(id: ArcModelId): ArcModel {
  return ARC_MODELS[id]
}
