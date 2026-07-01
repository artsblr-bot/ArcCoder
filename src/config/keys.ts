// Hardcoded provider keys (client-side by design — see vite proxy / vercel rewrites).
// These are never surfaced in the UI; the app presents only "Arc3Mini" / "Arc3Ultra".
// The proxy is purely a CORS workaround.

// Arc3Ultra → MiniMax-M3 via NVIDIA NIM. A small pool for round-robin headroom.
export const NVIDIA_API_KEYS: readonly string[] = [
  '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',
  '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',
]

// Arc3Mini → GLM-4.7-Flash via Z.ai (free).
export const ZAI_API_KEY = 'b9a776ba19634cf7885ffcae7ec87b81.y8lHXZTxyP99Jrhi'

// Per-NVIDIA-key self-throttle (each key allows ~40 RPM; stay comfortably under).
export const RPM_PER_KEY = 25
export const RPM_WINDOW_MS = 60_000
// Global Arc3Ultra cap requested by the product: ≤ 30 requests / minute from our side.
export const ULTRA_RPM = 30

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

export interface RpmUsage {
  used: number
  limit: number
  perKey: number
  waiting: boolean
}

/**
 * Round-robin key manager with a per-key sliding-window rate limiter and
 * Retry-After-aware cooldown/backoff. `await acquire()` before each request.
 */
export class KeyPool {
  private keys: string[]
  private idx = 0
  private cooldownUntil = new Map<string, number>()
  private hits = new Map<string, number[]>()
  private waiters = 0
  private readonly rpm: number
  private readonly windowMs: number

  constructor(keys: readonly string[] = NVIDIA_API_KEYS, rpm = RPM_PER_KEY, windowMs = RPM_WINDOW_MS) {
    this.keys = [...keys]
    if (this.keys.length === 0) throw new Error('KeyPool: no API keys configured')
    this.rpm = rpm
    this.windowMs = windowMs
  }

  private prune(key: string, now: number): number[] {
    const arr = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs)
    this.hits.set(key, arr)
    return arr
  }

  private cooling(key: string, now: number): boolean {
    return (this.cooldownUntil.get(key) ?? 0) > now
  }

  private freeAt(key: string, now: number): number {
    const arr = this.prune(key, now)
    const rateFree = arr.length < this.rpm ? now : arr[arr.length - this.rpm] + this.windowMs
    return Math.max(rateFree, this.cooldownUntil.get(key) ?? 0)
  }

  async acquire(signal?: AbortSignal): Promise<string> {
    for (;;) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
      const now = Date.now()
      for (let n = 0; n < this.keys.length; n++) {
        const k = this.keys[this.idx % this.keys.length]
        this.idx++
        if (!this.cooling(k, now) && this.prune(k, now).length < this.rpm) {
          this.hits.get(k)!.push(now)
          return k
        }
      }
      const soonest = Math.min(...this.keys.map((k) => this.freeAt(k, now)))
      const wait = Math.max(50, soonest - now)
      this.waiters++
      try {
        await sleep(wait, signal)
      } finally {
        this.waiters--
      }
    }
  }

  penalize(key: string, ms: number): void {
    this.cooldownUntil.set(key, Date.now() + ms)
  }

  usage(now = Date.now()): RpmUsage {
    let used = 0
    for (const k of this.keys) used += this.prune(k, now).length
    return { used, limit: this.rpm * this.keys.length, perKey: this.rpm, waiting: this.waiters > 0 }
  }

  get size(): number {
    return this.keys.length
  }
}

export const keyPool = new KeyPool()

/**
 * Global sliding-window limiter (not per-key). Parks the caller until fewer than
 * `max` requests sit in the trailing window. Used to hold Arc3Ultra to ULTRA_RPM.
 */
export class SlidingWindowLimiter {
  private hits: number[] = []
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  private prune(now: number): number[] {
    this.hits = this.hits.filter((t) => t > now - this.windowMs)
    return this.hits
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    for (;;) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
      const now = Date.now()
      const h = this.prune(now)
      if (h.length < this.max) {
        h.push(now)
        return
      }
      await sleep(Math.max(50, h[0] + this.windowMs - now), signal)
    }
  }

  usage(now = Date.now()): { used: number; limit: number } {
    return { used: this.prune(now).length, limit: this.max }
  }
}

/**
 * Arc3Ultra throttle: ≤ ULTRA_RPM calls/minute. Best-effort PER SESSION (per browser
 * tab) — a client-side limiter cannot enforce a truly global cap; that would need the
 * proxy/edge layer. N open tabs can each reach ULTRA_RPM.
 */
export const ultraLimiter = new SlidingWindowLimiter(ULTRA_RPM, 60_000)
