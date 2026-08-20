import { describe, expect, it } from 'vitest'
import { BASE_ANCHORS_NORMALIZED, normalizeHitCoordinate } from '../coordinates'

function normalizedDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

describe('normalizeHitCoordinate', () => {
  const moundDistanceFromHome = normalizedDistance(BASE_ANCHORS_NORMALIZED.home, BASE_ANCHORS_NORMALIZED.mound)

  it('projects a routine outfield flyout well beyond the pitcher\'s mound', () => {
    // A medium-depth fly to center field — nowhere near the deepest part of the grid.
    const point = normalizeHitCoordinate(125, 120)
    const distance = normalizedDistance(point, BASE_ANCHORS_NORMALIZED.home)
    expect(distance).toBeGreaterThan(moundDistanceFromHome * 2)
  })

  it('projects a deep home run swing farther than a shallow infield pop-up', () => {
    const deep = normalizeHitCoordinate(125, 30)
    const shallow = normalizeHitCoordinate(125, 180)
    expect(normalizedDistance(deep, BASE_ANCHORS_NORMALIZED.home)).toBeGreaterThan(
      normalizedDistance(shallow, BASE_ANCHORS_NORMALIZED.home),
    )
  })

  it('keeps a dead-center coordinate on the home-plate axis (x unchanged)', () => {
    const point = normalizeHitCoordinate(125.42, 100)
    expect(point.x).toBeCloseTo(BASE_ANCHORS_NORMALIZED.home.x, 3)
  })
})
