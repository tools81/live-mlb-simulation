import type { Play, PlayEvent } from '../api/types'
import { Easing } from '../animation/tween'
import {
  BASE_ANCHORS_NORMALIZED,
  FIELDER_POSITIONS_NORMALIZED,
  expandBasePath,
  normalizeHitCoordinate,
  type BaseCode,
  type PositionCode,
} from './coordinates'
import type { ChoreographyStep, NormalizedPoint } from './types'

const BATTER_POP_POSITION: NormalizedPoint = {
  x: BASE_ANCHORS_NORMALIZED.home.x,
  y: BASE_ANCHORS_NORMALIZED.home.y - 0.08,
}

const FT_PER_SEC_PER_MPH = 1.467
const PITCH_TRAVEL_DISTANCE_FT = 55

function pitchDurationMs(startSpeedMph: number | undefined): number {
  const speed = startSpeedMph && startSpeedMph > 0 ? startSpeedMph : 90
  const feetPerSecond = speed * FT_PER_SEC_PER_MPH
  const seconds = PITCH_TRAVEL_DISTANCE_FT / feetPerSecond
  return Math.max(250, Math.min(900, seconds * 1000))
}

/** Choreography for a single live pitch: the ball travels from the mound to home plate. */
export function resolvePitchChoreography(event: PlayEvent): ChoreographyStep[] {
  return [
    {
      kind: 'ballFlight',
      group: 0,
      from: BASE_ANCHORS_NORMALIZED.mound,
      to: BASE_ANCHORS_NORMALIZED.home,
      arcHeight: 0.02,
      spin: true,
      durationMs: pitchDurationMs(event.pitchData?.startSpeed),
      easing: Easing.linear,
    },
  ]
}

const HIT_EVENT_TYPES = new Set(['single', 'double', 'triple', 'home_run'])
const OUTFIELD_POSITIONS: PositionCode[] = ['7', '8', '9']

function distance(a: NormalizedPoint, b: NormalizedPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function nearestOutfielderPosition(point: NormalizedPoint): NormalizedPoint {
  return OUTFIELD_POSITIONS.map((position) => FIELDER_POSITIONS_NORMALIZED[position]).reduce((nearest, candidate) =>
    distance(candidate, point) < distance(nearest, point) ? candidate : nearest,
  )
}

function ballDestination(play: Play, inPlayEvent: PlayEvent | undefined): NormalizedPoint {
  const coords = inPlayEvent?.hitData?.coordinates
  if (coords) {
    const point = normalizeHitCoordinate(coords.coordX, coords.coordY)
    // A caught fly ball (out, not a hit) should visibly land right on the fielder who caught it
    // rather than at the (approximate) raw hit coordinate.
    const isFlyOut = inPlayEvent?.hitData?.trajectory === 'fly_ball' && !HIT_EVENT_TYPES.has(play.result.eventType ?? '')
    return isFlyOut ? nearestOutfielderPosition(point) : point
  }

  for (const runner of play.runners) {
    const putoutCredit = runner.credits?.find((c) => c.credit.includes('putout'))
    if (putoutCredit) {
      const position = FIELDER_POSITIONS_NORMALIZED[putoutCredit.position.code as PositionCode]
      if (position) return position
    }
  }
  return FIELDER_POSITIONS_NORMALIZED['6']
}

function arcHeightFor(trajectory: string | undefined, isHomeRun: boolean): number {
  if (isHomeRun) return 0.4
  switch (trajectory) {
    case 'ground_ball':
      return 0.02
    case 'line_drive':
      return 0.08
    case 'popup':
      return 0.25
    case 'fly_ball':
    default:
      return 0.18
  }
}

function ballFlightDurationMs(totalDistanceFt: number | undefined, isHomeRun: boolean): number {
  const distance = totalDistanceFt ?? (isHomeRun ? 400 : 180)
  const base = Math.max(500, Math.min(3000, 300 + distance * 2))
  return isHomeRun ? base * 1.4 : base
}

/**
 * Choreography for a completed at-bat's outcome: the batted ball (if any), every runner's
 * movement per `runners[]` (the authoritative source — never inferred from eventType), and any
 * flourishes (K graphic, home run celebration, out call).
 */
export function resolveOutcomeChoreography(play: Play): ChoreographyStep[] {
  const steps: ChoreographyStep[] = []
  const eventType = play.result.eventType ?? ''
  const isHomeRun = eventType === 'home_run'
  const isStrikeout = eventType.includes('strikeout')
  const inPlayEvent = play.playEvents.find((e) => e.details.isInPlay)

  let group = 0

  if (inPlayEvent) {
    steps.push({
      kind: 'ballFlight',
      group,
      from: BASE_ANCHORS_NORMALIZED.home,
      to: ballDestination(play, inPlayEvent),
      arcHeight: arcHeightFor(inPlayEvent.hitData?.trajectory, isHomeRun),
      spin: true,
      durationMs: ballFlightDurationMs(inPlayEvent.hitData?.totalDistance, isHomeRun),
      easing: Easing.easeOutQuad,
    })
    group += 1
  }

  if (isStrikeout) {
    steps.push({
      kind: 'textPop',
      group,
      text: 'K',
      at: BATTER_POP_POSITION,
      tone: 'out',
      durationMs: 900,
    })
    group += 1
  }

  const runnerGroupStart = group
  let maxLegs = 0
  const outCalls: { at: NormalizedPoint; group: number }[] = []

  for (const runner of play.runners) {
    const target = (runner.movement.isOut ? runner.movement.outBase : runner.movement.end) as BaseCode
    const legs = expandBasePath(runner.movement.start as BaseCode, target)
    if (legs.length === 0) continue

    let from = legs.length > 0 ? previousAnchor(runner.movement.start as BaseCode) : BASE_ANCHORS_NORMALIZED.home
    legs.forEach((to, legIndex) => {
      const isLastLeg = legIndex === legs.length - 1
      steps.push({
        kind: 'runnerMove',
        group: runnerGroupStart + legIndex,
        playerId: runner.details.runner.id,
        from,
        to,
        isOut: isLastLeg && runner.movement.isOut,
        isScoring: isLastLeg && !runner.movement.isOut && runner.details.isScoringEvent,
        durationMs: 550,
        easing: Easing.easeInOutQuad,
      })
      from = to
    })
    maxLegs = Math.max(maxLegs, legs.length)

    if (runner.movement.isOut) {
      outCalls.push({ at: legs[legs.length - 1], group: runnerGroupStart + legs.length })
    }
  }

  group = runnerGroupStart + maxLegs
  for (const outCall of outCalls) {
    steps.push({
      kind: 'textPop',
      group: outCall.group,
      text: 'OUT',
      at: outCall.at,
      tone: 'out',
      durationMs: 700,
    })
  }
  if (outCalls.length > 0) group += 1

  if (isHomeRun) {
    steps.push({
      kind: 'celebration',
      group,
      at: BASE_ANCHORS_NORMALIZED.home,
      durationMs: 1200,
    })
  }

  return steps
}

function previousAnchor(start: BaseCode): NormalizedPoint {
  switch (start) {
    case '1B':
      return BASE_ANCHORS_NORMALIZED.first
    case '2B':
      return BASE_ANCHORS_NORMALIZED.second
    case '3B':
      return BASE_ANCHORS_NORMALIZED.third
    default:
      return BASE_ANCHORS_NORMALIZED.home
  }
}
