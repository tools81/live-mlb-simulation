import { describe, expect, it } from 'vitest'
import { STADIUM_IMAGE_HEIGHT, STADIUM_IMAGE_WIDTH, STADIUM_WALL_ANCHORS_PX } from '../../config/constants'
import { BASE_ANCHORS_NORMALIZED, homeRunLandingSpot, normalizeHitCoordinate, wallPixelYAtX } from '../coordinates'

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

  it('does not clamp routine (non-wall-reaching) hits to the wall, unlike a naive linear projection', () => {
    // Real coordinates/trajectories pulled from a completed game, each well short of any fence.
    const samples: { name: string; coordX: number; coordY: number }[] = [
      { name: 'shallow popup', coordX: 95.49, coordY: 190.11 },
      { name: 'medium fly ball', coordX: 194.69, coordY: 122.54 },
      { name: 'line drive single', coordX: 158.04, coordY: 110.96 },
      { name: 'deep fly out', coordX: 160.91, coordY: 73.91 },
    ]

    for (const { name, coordX, coordY } of samples) {
      const point = normalizeHitCoordinate(coordX, coordY)
      const wallY = wallPixelYAtX(point.x * STADIUM_IMAGE_WIDTH)
      // Well clear of the wall line, not pinned right against it.
      expect(point.y * STADIUM_IMAGE_HEIGHT, name).toBeGreaterThan(wallY + 40)
    }
  })

  it('places two different-depth fly balls at two different depths, not both at the wall', () => {
    const shallow = normalizeHitCoordinate(194.69, 122.54) // ~256ft real fly out
    const deep = normalizeHitCoordinate(160.91, 73.91) // ~324ft real fly out
    expect(normalizedDistance(deep, BASE_ANCHORS_NORMALIZED.home)).toBeGreaterThan(
      normalizedDistance(shallow, BASE_ANCHORS_NORMALIZED.home),
    )
  })
})

describe('homeRunLandingSpot', () => {
  it('always lands beyond the wall curve at that x, for hits toward either line and center', () => {
    const samples: { name: string; coordX: number; coordY: number }[] = [
      { name: 'left field grand slam', coordX: 33.83, coordY: 85.61 },
      { name: 'center field homer', coordX: 107.66, coordY: 27.88 },
      { name: 'right field homer', coordX: 194.69, coordY: 60 },
    ]

    for (const { name, coordX, coordY } of samples) {
      const point = homeRunLandingSpot(coordX, coordY)
      const wallY = wallPixelYAtX(point.x * STADIUM_IMAGE_WIDTH)
      // Smaller pixel y = deeper into the field, i.e. past the wall from home's perspective.
      expect(point.y * STADIUM_IMAGE_HEIGHT, name).toBeLessThan(wallY)
    }
  })

  it('sends a homer toward left field to the left of one toward right field', () => {
    const leftField = homeRunLandingSpot(33.83, 85.61)
    const rightField = homeRunLandingSpot(210, 85.61)
    expect(leftField.x).toBeLessThan(rightField.x)
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
