import {
  STADIUM_BASE_ANCHORS_PX,
  STADIUM_IMAGE_HEIGHT,
  STADIUM_IMAGE_WIDTH,
} from '../config/constants'
import type { NormalizedPoint, PixelPoint } from './types'

function toNormalized(px: { x: number; y: number }): NormalizedPoint {
  return { x: px.x / STADIUM_IMAGE_WIDTH, y: px.y / STADIUM_IMAGE_HEIGHT }
}

export const BASE_ANCHORS_NORMALIZED = {
  home: toNormalized(STADIUM_BASE_ANCHORS_PX.home),
  first: toNormalized(STADIUM_BASE_ANCHORS_PX.first),
  second: toNormalized(STADIUM_BASE_ANCHORS_PX.second),
  third: toNormalized(STADIUM_BASE_ANCHORS_PX.third),
  mound: toNormalized(STADIUM_BASE_ANCHORS_PX.mound),
} as const

/**
 * The official distance from the pitching rubber to home plate (60.5ft) gives an empirical
 * pixels-per-foot scale for this specific stadium image, since both anchor points are known
 * precisely. Used to project hit distances onto the field.
 */
const MOUND_TO_HOME_FEET = 60.5
const MOUND_TO_HOME_PX = Math.hypot(
  STADIUM_BASE_ANCHORS_PX.home.x - STADIUM_BASE_ANCHORS_PX.mound.x,
  STADIUM_BASE_ANCHORS_PX.home.y - STADIUM_BASE_ANCHORS_PX.mound.y,
)
const PIXELS_PER_FOOT = MOUND_TO_HOME_PX / MOUND_TO_HOME_FEET

export function normalizedToPixel(point: NormalizedPoint, stageWidth: number, stageHeight: number): PixelPoint {
  return { x: point.x * stageWidth, y: point.y * stageHeight }
}

/**
 * The stadium art is a stylized forced-perspective drawing, not an orthographic top-down view —
 * distances compress non-linearly toward the outfield fence. A single linear px-per-foot scale
 * (calibrated off the short, precisely-known mound-to-home distance) badly over-extrapolates for
 * deep fly balls and outfielders, pushing them above the visible playing field entirely. Clamping
 * to the grass area keeps every projected point on-stage while preserving relative depth/direction.
 */
const FIELD_BOUNDS = { minX: 0.03, maxX: 0.97, minY: 0.1, maxY: 0.98 }

function clampToField(point: NormalizedPoint): NormalizedPoint {
  return {
    x: Math.min(FIELD_BOUNDS.maxX, Math.max(FIELD_BOUNDS.minX, point.x)),
    y: Math.min(FIELD_BOUNDS.maxY, Math.max(FIELD_BOUNDS.minY, point.y)),
  }
}

/** movement.start / movement.end / movement.outBase values from the live feed's runners[]. */
export type BaseCode = '1B' | '2B' | '3B' | 'score' | null

export function baseCodeToAnchor(code: BaseCode): NormalizedPoint {
  switch (code) {
    case '1B':
      return BASE_ANCHORS_NORMALIZED.first
    case '2B':
      return BASE_ANCHORS_NORMALIZED.second
    case '3B':
      return BASE_ANCHORS_NORMALIZED.third
    case 'score':
    case null:
      return BASE_ANCHORS_NORMALIZED.home
  }
}

/**
 * hitData.coordinates are on an MLB Gameday ~0-250 grid, not feet. The conversion below uses the
 * commonly-observed community calibration (home plate near (125.42, 198.27), ~2.5 FEET per grid
 * unit — i.e. multiply the coordinate delta by 2.5 to get feet, not divide) and is APPROXIMATE —
 * flagged for empirical tuning against real recorded hits.
 */
const HIT_GRID_ORIGIN = { x: 125.42, y: 198.27 }
const HIT_GRID_FEET_PER_UNIT = 2.5

export function normalizeHitCoordinate(coordX: number, coordY: number): NormalizedPoint {
  const xFeet = (coordX - HIT_GRID_ORIGIN.x) * HIT_GRID_FEET_PER_UNIT
  const yFeet = (HIT_GRID_ORIGIN.y - coordY) * HIT_GRID_FEET_PER_UNIT
  return clampToField({
    x: BASE_ANCHORS_NORMALIZED.home.x + (xFeet * PIXELS_PER_FOOT) / STADIUM_IMAGE_WIDTH,
    y: BASE_ANCHORS_NORMALIZED.home.y - (yFeet * PIXELS_PER_FOOT) / STADIUM_IMAGE_HEIGHT,
  })
}

/** Standard MLB position codes: 1=P 2=C 3=1B 4=2B 5=3B 6=SS 7=LF 8=CF 9=RF */
export type PositionCode = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

function fromHomeFeet(xFeet: number, yFeet: number): NormalizedPoint {
  return clampToField({
    x: BASE_ANCHORS_NORMALIZED.home.x + (xFeet * PIXELS_PER_FOOT) / STADIUM_IMAGE_WIDTH,
    y: BASE_ANCHORS_NORMALIZED.home.y - (yFeet * PIXELS_PER_FOOT) / STADIUM_IMAGE_HEIGHT,
  })
}

/** Approximate standard defensive positioning, in normalized field coordinates. */
export const FIELDER_POSITIONS_NORMALIZED: Record<PositionCode, NormalizedPoint> = {
  '1': BASE_ANCHORS_NORMALIZED.mound,
  '2': fromHomeFeet(0, -15),
  '3': fromHomeFeet(58, 78),
  '4': fromHomeFeet(35, 110),
  '5': fromHomeFeet(-58, 78),
  '6': fromHomeFeet(-35, 110),
  '7': fromHomeFeet(-100, 160),
  '8': fromHomeFeet(0, 180),
  '9': fromHomeFeet(100, 160),
}

/**
 * Ordered waypoints (exclusive of `start`, inclusive of `target`) a runner passes through when
 * advancing from one base to another — so a runner scoring from first touches 2nd and 3rd on the
 * way, rather than cutting straight across the infield.
 */
const BASE_ORDINAL: Record<'home' | '1B' | '2B' | '3B' | 'score', number> = {
  home: 0,
  '1B': 1,
  '2B': 2,
  '3B': 3,
  score: 4,
}

function ordinalOf(code: BaseCode): number {
  return code === null ? BASE_ORDINAL.home : BASE_ORDINAL[code]
}

function anchorForOrdinal(ordinal: number): NormalizedPoint {
  switch (((ordinal % 4) + 4) % 4) {
    case 1:
      return BASE_ANCHORS_NORMALIZED.first
    case 2:
      return BASE_ANCHORS_NORMALIZED.second
    case 3:
      return BASE_ANCHORS_NORMALIZED.third
    default:
      return BASE_ANCHORS_NORMALIZED.home
  }
}

export function expandBasePath(start: BaseCode, target: BaseCode): NormalizedPoint[] {
  if (target === null) return []
  const startOrdinal = ordinalOf(start)
  const targetOrdinal = ordinalOf(target)
  const waypoints: NormalizedPoint[] = []
  for (let ordinal = startOrdinal + 1; ordinal <= targetOrdinal; ordinal++) {
    waypoints.push(anchorForOrdinal(ordinal))
  }
  return waypoints
}
