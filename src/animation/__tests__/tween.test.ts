import { describe, expect, it } from 'vitest'
import { Easing, TweenManager } from '../tween'

describe('TweenManager', () => {
  it('interpolates linearly between from and to over the given duration', () => {
    const manager = new TweenManager()
    const samples: number[] = []

    const done = manager.play({
      from: { x: 0 },
      to: { x: 10 },
      durationMs: 100,
      onUpdate: (v) => samples.push(v.x),
    })

    manager.update(25)
    manager.update(25)
    manager.update(25)
    manager.update(25)

    expect(samples).toEqual([2.5, 5, 7.5, 10])
    return done
  })

  it('resolves its promise and stops tracking the tween once complete', async () => {
    const manager = new TweenManager()
    const done = manager.play({ from: { x: 0 }, to: { x: 1 }, durationMs: 10, onUpdate: () => {} })

    manager.update(10)
    await done

    expect(manager.activeCount).toBe(0)
  })

  it('clamps progress at 1 even if a single tick overshoots the duration', () => {
    const manager = new TweenManager()
    let last = -1
    const done = manager.play({ from: { x: 0 }, to: { x: 100 }, durationMs: 50, onUpdate: (v) => (last = v.x) })

    manager.update(1000)

    expect(last).toBe(100)
    return done
  })

  it('easeOutQuad reaches the target and starts faster than linear', () => {
    expect(Easing.easeOutQuad(0)).toBe(0)
    expect(Easing.easeOutQuad(1)).toBe(1)
    expect(Easing.easeOutQuad(0.5)).toBeGreaterThan(0.5)
  })

  it('parabola peaks at the midpoint and is zero at both ends', () => {
    expect(Easing.parabola(0)).toBe(0)
    expect(Easing.parabola(1)).toBe(0)
    expect(Easing.parabola(0.5)).toBe(1)
  })
})
