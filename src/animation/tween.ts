export type EasingFn = (t: number) => number

export const Easing = {
  linear: (t: number) => t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInQuad: (t: number) => t * t,
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  /** 0 at t=0 and t=1, peaks at 1 when t=0.5 — used to shape ball-arc height. */
  parabola: (t: number) => 4 * t * (1 - t),
}

type NumericRecord = Record<string, number>

export interface TweenOptions<T extends NumericRecord> {
  from: T
  to: T
  durationMs: number
  easing?: EasingFn
  onUpdate: (value: T, t: number) => void
  onComplete?: () => void
}

interface ActiveTween {
  tick(deltaMs: number): void
  readonly done: boolean
}

class Tween<T extends NumericRecord> implements ActiveTween {
  private elapsedMs = 0
  private options: TweenOptions<T>
  done = false

  constructor(options: TweenOptions<T>) {
    this.options = options
  }

  tick(deltaMs: number): void {
    if (this.done) return
    this.elapsedMs += deltaMs
    const rawT = this.options.durationMs <= 0 ? 1 : Math.min(1, this.elapsedMs / this.options.durationMs)
    const easing = this.options.easing ?? Easing.linear
    const easedT = easing(rawT)

    const { from, to } = this.options
    const value = {} as T
    for (const key in from) {
      value[key] = (from[key] + (to[key] - from[key]) * easedT) as T[Extract<keyof T, string>]
    }
    this.options.onUpdate(value, rawT)

    if (rawT >= 1) {
      this.done = true
      this.options.onComplete?.()
    }
  }
}

/** Drives a set of active tweens from a single external clock (e.g. a Pixi ticker or rAF loop). */
export class TweenManager {
  private active: ActiveTween[] = []

  update(deltaMs: number): void {
    if (this.active.length === 0) return
    for (const tween of this.active) tween.tick(deltaMs)
    this.active = this.active.filter((t) => !t.done)
  }

  /** Starts a tween and resolves once it completes. */
  play<T extends NumericRecord>(options: TweenOptions<T>): Promise<void> {
    return new Promise((resolve) => {
      const tween = new Tween<T>({
        ...options,
        onComplete: () => {
          options.onComplete?.()
          resolve()
        },
      })
      this.active.push(tween)
    })
  }

  get activeCount(): number {
    return this.active.length
  }
}
