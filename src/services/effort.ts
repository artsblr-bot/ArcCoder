// Effort is one of Arc's three control axes (Model · Mode · Effort). It scales how
// much Arc spends: reasoning depth, upfront planning/research, self-review passes,
// and verification loops. SUPERCODE is the structurally-different top gear.

export type EffortLevel = 'low' | 'medium' | 'high' | 'max' | 'supercode'

export interface EffortConfig {
  level: EffortLevel
  label: string
  /** Token ceiling per model turn. */
  maxTokens: number
  /** Ask the model to stream reasoning_content. */
  reasoning: boolean
  /** 0 = none, higher = more thorough plan + research before acting. */
  planDepth: number
  /** Self-review/critique passes after a first result. */
  reviewPasses: number
  /** Build→test→fix loops before declaring done. */
  verifyLoops: number
  /** SUPERCODE engages the multi-stage pipeline + boost skin. */
  supercode: boolean
  /** Bias routing toward Arc3Ultra. */
  forcesUltra: boolean
}

export const EFFORTS: Record<EffortLevel, EffortConfig> = {
  low: { level: 'low', label: 'Low', maxTokens: 2048, reasoning: false, planDepth: 0, reviewPasses: 0, verifyLoops: 0, supercode: false, forcesUltra: false },
  medium: { level: 'medium', label: 'Medium', maxTokens: 4096, reasoning: true, planDepth: 1, reviewPasses: 0, verifyLoops: 0, supercode: false, forcesUltra: false },
  high: { level: 'high', label: 'High', maxTokens: 8192, reasoning: true, planDepth: 1, reviewPasses: 1, verifyLoops: 1, supercode: false, forcesUltra: false },
  max: { level: 'max', label: 'Max', maxTokens: 16384, reasoning: true, planDepth: 2, reviewPasses: 2, verifyLoops: 1, supercode: false, forcesUltra: true },
  supercode: { level: 'supercode', label: 'SUPERCODE', maxTokens: 32768, reasoning: true, planDepth: 3, reviewPasses: 2, verifyLoops: 2, supercode: true, forcesUltra: true },
}

export const EFFORT_ORDER: EffortLevel[] = ['low', 'medium', 'high', 'max', 'supercode']
export const DEFAULT_EFFORT: EffortLevel = 'medium'

export function effortConfig(level: EffortLevel): EffortConfig {
  return EFFORTS[level]
}
