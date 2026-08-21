import {
  STADIUM_BASE_ANCHORS_PX,
  STADIUM_IMAGE_HEIGHT,
  STADIUM_IMAGE_WIDTH,
  STADIUM_WALL_ANCHORS_PX,
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
 * precisely. Used for short (infield) distances and as one calibration point for the outfield
 * projection below.
 */
const MOUND_TO_HOME_FEET = 60.5
const MOUND_TO_HOME_PX = Math.hypot(
  STADIUM_BASE_ANCHORS_PX.home.x - STADIUM_BASE_ANCHORS_PX.mound.x,
  STADIUM_BASE_ANCHORS_PX.home.y - STADIUM_BASE_ANCHORS_PX.mound.y,
)
const PIXELS_PER_FOOT = MOUND_TO_HOME_PX / MOUND_TO_HOME_FEET

/**
 * The stadium art is a forced-perspective drawing: a single linear px-per-foot scale (e.g. the
 * short, precise mound-to-home one above) badly OVER-projects outfield distances, since real
 * depth compresses more and more the farther it gets from the viewer — every fly ball, line
 * drive, and home run ended up computing a raw position far above the top of the image, which the
 * wall clamp then pinned to the exact same spot: the wall, every time, regardless of actual depth.
 *
 * Fit a power curve `px = a * feet^b` through two known points instead — the same short mound
 * distance, and the long one from home to the drawn center-field wall (using its "400" ft label)
 * — which reproduces the compression a linear scale can't.
 */
const WALL_CENTER_DEPTH_FEET = 400
const WALL_CENTER_DEPTH_PX = STADIUM_BASE_ANCHORS_PX.home.y - STADIUM_WALL_ANCHORS_PX.center.y
const DEPTH_CURVE_EXPONENT =
  Math.log(WALL_CENTER_DEPTH_PX / MOUND_TO_HOME_PX) / Math.log(WALL_CENTER_DEPTH_FEET / MOUND_TO_HOME_FEET)
const DEPTH_CURVE_SCALE = MOUND_TO_HOME_PX / Math.pow(MOUND_TO_HOME_FEET, DEPTH_CURVE_EXPONENT)

function feetToRadialPixels(feet: number): number {
  return DEPTH_CURVE_SCALE * Math.pow(Math.max(0, feet), DEPTH_CURVE_EXPONENT)
}

export function normalizedToPixel(point: NormalizedPoint, stageWidth: number, stageHeight: number): PixelPoint {
  return { x: point.x * stageWidth, y: point.y * stageHeight }
}

/**
 * The stadium art is a stylized forced-perspective drawing, not an orthographic top-down view —
 * distances compress non-linearly toward the outfield fence, and the fence itself is a curved
 * wall (with stands behind it), not a flat line: it's shallow at the corners and deep in center.
 * Fitting a quadratic through the three known wall points (left corner, center, right corner)
 * gives an accurate "how deep can a ball go at this x" boundary — a flat cutoff either lets balls
 * down the lines fly into the stands, or stops true center-field drives well short of the fence.
 */
const WALL_MARGIN_PX = 14

export function wallPixelYAtX(pixelX: number): number {
  const { leftCorner: l, center: c, rightCorner: r } = STADIUM_WALL_ANCHORS_PX
  const x = Math.min(r.x, Math.max(l.x, pixelX))
  // Lagrange quadratic interpolation through the three wall anchor points.
  const l0 = ((x - c.x) * (x - r.x)) / ((l.x - c.x) * (l.x - r.x))
  const l1 = ((x - l.x) * (x - r.x)) / ((c.x - l.x) * (c.x - r.x))
  const l2 = ((x - l.x) * (x - c.x)) / ((r.x - l.x) * (r.x - c.x))
  return l.y * l0 + c.y * l1 + r.y * l2
}

const FIELD_BOUNDS = {
  minX: STADIUM_WALL_ANCHORS_PX.leftCorner.x / STADIUM_IMAGE_WIDTH,
  maxX: STADIUM_WALL_ANCHORS_PX.rightCorner.x / STADIUM_IMAGE_WIDTH,
  maxY: 0.98,
}

function clampToField(point: NormalizedPoint): NormalizedPoint {
  const x = Math.min(FIELD_BOUNDS.maxX, Math.max(FIELD_BOUNDS.minX, point.x))
  const minY = (wallPixelYAtX(x * STADIUM_IMAGE_WIDTH) + WALL_MARGIN_PX) / STADIUM_IMAGE_HEIGHT
  const y = Math.min(FIELD_BOUNDS.maxY, Math.max(minY, point.y))
  return { x, y }
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
 * flagged for empirical tuning against real recorded hits. Verified against ~50 real plays from a
 * completed game: this calibration lines up closely with the feed's own `hitData.totalDistance`
 * for airborne trajectories (fly balls/line drives/popups); ground balls' `totalDistance` isn't a
 * comparable quantity so it's not used to sanity-check those.
 */
const HIT_GRID_ORIGIN = { x: 125.42, y: 198.27 }
const HIT_GRID_FEET_PER_UNIT = 2.5

/** The real-world (xFeet, yFeet) offset from home plate a raw hit coordinate represents. */
function hitFeetOffset(coordX: number, coordY: number): { xFeet: number; yFeet: number } {
  return {
    xFeet: (coordX - HIT_GRID_ORIGIN.x) * HIT_GRID_FEET_PER_UNIT,
    yFeet: (HIT_GRID_ORIGIN.y - coordY) * HIT_GRID_FEET_PER_UNIT,
  }
}

export function normalizeHitCoordinate(coordX: number, coordY: number): NormalizedPoint {
  const { xFeet, yFeet } = hitFeetOffset(coordX, coordY)
  const radiusFeet = Math.hypot(xFeet, yFeet)
  if (radiusFeet === 0) return BASE_ANCHORS_NORMALIZED.home

  const radiusPx = feetToRadialPixels(radiusFeet)
  return clampToField({
    x: BASE_ANCHORS_NORMALIZED.home.x + ((xFeet / radiusFeet) * radiusPx) / STADIUM_IMAGE_WIDTH,
    y: BASE_ANCHORS_NORMALIZED.home.y - ((yFeet / radiusFeet) * radiusPx) / STADIUM_IMAGE_HEIGHT,
  })
}

const HOME_RUN_OVER_WALL_MARGIN_PX = 24

/**
 * A home run must visibly clear the fence, not just approach it — but its raw projected distance
 * doesn't reliably exceed the wall's curve at every angle (the wall is much shallower down the
 * lines than in center). So instead of projecting a distance, this keeps only the hit's direction
 * and places it a fixed margin beyond the wall's curve at that angle, guaranteeing every home run
 * clears the fence it's hit toward.
 */
export function homeRunLandingSpot(coordX: number, coordY: number): NormalizedPoint {
  const { xFeet, yFeet } = hitFeetOffset(coordX, coordY)
  const radiusFeet = Math.hypot(xFeet, yFeet) || 1
  const lateralUnit = xFeet / radiusFeet

  const farPx = STADIUM_IMAGE_HEIGHT * 2
  const rawX = BASE_ANCHORS_NORMALIZED.home.x * STADIUM_IMAGE_WIDTH + lateralUnit * farPx
  const x = Math.min(STADIUM_WALL_ANCHORS_PX.rightCorner.x, Math.max(STADIUM_WALL_ANCHORS_PX.leftCorner.x, rawX))
  const y = Math.max(4, wallPixelYAtX(x) - HOME_RUN_OVER_WALL_MARGIN_PX)

  return { x: x / STADIUM_IMAGE_WIDTH, y: y / STADIUM_IMAGE_HEIGHT }
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
