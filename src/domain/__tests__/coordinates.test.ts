import { describe, expect, it } from 'vitest'
import { STADIUM_IMAGE_HEIGHT, STADIUM_IMAGE_WIDTH, STADIUM_WALL_ANCHORS_PX } from '../../config/constants'
import { BASE_ANCHORS_NORMALIZED, normalizeHitCoordinate, wallPixelYAtX } from '../coordinates'

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

  it('does not send an extreme deep coordinate past the curved outfield wall at that x', () => {
    // Deep down the left field line — the wall is shallow there, so this should clamp hard.
    const downTheLine = normalizeHitCoordinate(10, 0)
    const wallYAtThatX = wallPixelYAtX(downTheLine.x * STADIUM_IMAGE_WIDTH)
    expect(downTheLine.y * STADIUM_IMAGE_HEIGHT).toBeGreaterThanOrEqual(wallYAtThatX)

    // Way over center field — the wall is deepest there, so more room before clamping kicks in.
    const deepCenter = normalizeHitCoordinate(125.42, -50)
    const wallYAtCenter = wallPixelYAtX(deepCenter.x * STADIUM_IMAGE_WIDTH)
    expect(deepCenter.y * STADIUM_IMAGE_HEIGHT).toBeGreaterThanOrEqual(wallYAtCenter)
  })
})

describe('wallPixelYAtX', () => {
  it('passes exactly through the three known wall anchor points', () => {
    expect(wallPixelYAtX(STADIUM_WALL_ANCHORS_PX.leftCorner.x)).toBeCloseTo(STADIUM_WALL_ANCHORS_PX.leftCorner.y, 5)
    expect(wallPixelYAtX(STADIUM_WALL_ANCHORS_PX.center.x)).toBeCloseTo(STADIUM_WALL_ANCHORS_PX.center.y, 5)
    expect(wallPixelYAtX(STADIUM_WALL_ANCHORS_PX.rightCorner.x)).toBeCloseTo(STADIUM_WALL_ANCHORS_PX.rightCorner.y, 5)
  })

  it('is shallower (larger pixel y) at the corners than dead center', () => {
    expect(wallPixelYAtX(STADIUM_WALL_ANCHORS_PX.leftCorner.x)).toBeGreaterThan(wallPixelYAtX(STADIUM_WALL_ANCHORS_PX.center.x))
    expect(wallPixelYAtX(STADIUM_WALL_ANCHORS_PX.rightCorner.x)).toBeGreaterThan(wallPixelYAtX(STADIUM_WALL_ANCHORS_PX.center.x))
  })

  it('clamps out-of-range x to the nearest corner rather than extrapolating', () => {
    expect(wallPixelYAtX(-500)).toBeCloseTo(STADIUM_WALL_ANCHORS_PX.leftCorner.y, 5)
    expect(wallPixelYAtX(5000)).toBeCloseTo(STADIUM_WALL_ANCHORS_PX.rightCorner.y, 5)
  })
})
