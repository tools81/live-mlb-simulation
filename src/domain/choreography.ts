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
const ALL_FIELDER_POSITIONS: PositionCode[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

function distance(a: NormalizedPoint, b: NormalizedPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function nearestFielderPosition(point: NormalizedPoint): PositionCode {
  return ALL_FIELDER_POSITIONS.reduce((nearest, candidate) =>
    distance(FIELDER_POSITIONS_NORMALIZED[candidate], point) < distance(FIELDER_POSITIONS_NORMALIZED[nearest], point)
      ? candidate
      : nearest,
  )
}

/**
 * The fielders credited on this play, in the feed's own order — which is the actual chronological
 * order of the play (e.g. "third baseman X to first baseman Y" -> credits list the 3B assist
 * before the 1B putout). Empty if the feed has no credits at all (rare/older data).
 */
function creditedFielderChain(play: Play): PositionCode[] {
  for (const runner of play.runners) {
    if (!runner.credits || runner.credits.length === 0) continue
    const codes = runner.credits
      .filter((c) => c.credit.includes('assist') || c.credit.includes('putout'))
      .map((c) => c.position.code)
      .filter((code): code is PositionCode => (ALL_FIELDER_POSITIONS as string[]).includes(code))
    if (codes.length > 0) return codes
  }
  return []
}

/** Where the batted ball actually lands/is fielded — the raw (approximate) hit coordinate. */
function ballDestination(play: Play, inPlayEvent: PlayEvent | undefined): NormalizedPoint {
  const coords = inPlayEvent?.hitData?.coordinates
  if (coords) return normalizeHitCoordinate(coords.coordX, coords.coordY)

  const chain = creditedFielderChain(play)
  if (chain.length > 0) return FIELDER_POSITIONS_NORMALIZED[chain[0]]
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

const GROUND_BALL_TINT = 0x5fd15f
const LINE_DRIVE_TINT = 0xe0483e
const FLY_BALL_TINT = 0x4fa8f0
const HOME_RUN_TINT = 0xffd54a

function trailTintFor(trajectory: string | undefined, isHomeRun: boolean): number | undefined {
  if (isHomeRun) return HOME_RUN_TINT
  switch (trajectory) {
    case 'ground_ball':
      return GROUND_BALL_TINT
    case 'line_drive':
      return LINE_DRIVE_TINT
    case 'fly_ball':
      return FLY_BALL_TINT
    default:
      return undefined
  }
}

/**
 * Choreography for a completed at-bat's outcome: the batted ball (if any), every runner's
 * movement per `runners[]` (the authoritative source — never inferred from eventType), and any
 * flourishes (K graphic, home run celebration, out call).
 */
const FIELDER_RETURN_DURATION_MS = 600
const THROW_DURATION_MS = 450

export function resolveOutcomeChoreography(play: Play): ChoreographyStep[] {
  const steps: ChoreographyStep[] = []
  const eventType = play.result.eventType ?? ''
  const isHomeRun = eventType === 'home_run'
  const isHit = HIT_EVENT_TYPES.has(eventType)
  const isStrikeout = eventType.includes('strikeout')
  const inPlayEvent = play.playEvents.find((e) => e.details.isInPlay)

  let group = 0

  if (inPlayEvent) {
    const destination = ballDestination(play, inPlayEvent)
    const flightDurationMs = ballFlightDurationMs(inPlayEvent.hitData?.totalDistance, isHomeRun)

    steps.push({
      kind: 'ballFlight',
      group,
      from: BASE_ANCHORS_NORMALIZED.home,
      to: destination,
      arcHeight: arcHeightFor(inPlayEvent.hitData?.trajectory, isHomeRun),
      spin: true,
      durationMs: flightDurationMs,
      easing: Easing.easeOutQuad,
      tint: trailTintFor(inPlayEvent.hitData?.trajectory, isHomeRun),
      spawnGrassParticles: inPlayEvent.hitData?.trajectory === 'ground_ball',
    })

    // On an out (fly out, pop out, line out, ground out), the fielder who made the play visibly
    // moves to meet the ball rather than the ball snapping to them. When the feed credits more
    // than one fielder (e.g. "third baseman X to first baseman Y"), the ball is relayed/thrown
    // fielder to fielder in credited order before the fielder who left their spot returns to it.
    if (!isHit) {
      const chain = creditedFielderChain(play)
      const fielderChain = chain.length > 0 ? chain : [nearestFielderPosition(destination)]

      steps.push({
        kind: 'fielderMove',
        group,
        position: fielderChain[0],
        to: destination,
        durationMs: flightDurationMs,
        easing: Easing.easeInOutQuad,
      })

      let throwFrom = destination
      for (let i = 1; i < fielderChain.length; i++) {
        group += 1
        const receiverPoint = FIELDER_POSITIONS_NORMALIZED[fielderChain[i]]
        steps.push({
          kind: 'ballFlight',
          group,
          from: throwFrom,
          to: receiverPoint,
          arcHeight: 0.03,
          spin: true,
          durationMs: THROW_DURATION_MS,
          easing: Easing.easeInOutQuad,
        })
        throwFrom = receiverPoint
      }

      group += 1
      steps.push({
        kind: 'fielderMove',
        group,
        position: fielderChain[0],
        to: FIELDER_POSITIONS_NORMALIZED[fielderChain[0]],
        durationMs: FIELDER_RETURN_DURATION_MS,
        easing: Easing.easeInOutQuad,
      })
    } else {
      group += 1
    }
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
    // The batter's own runners[] entry on a strikeout just records the out — it's not a
    // baserunning event, and the "K" pop already communicates it. Animating it as a move to (and
    // "OUT" call at) some base reads as the batter running out a strikeout, which never happens.
    if (isStrikeout && runner.details.runner.id === play.matchup.batter.id) continue

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
