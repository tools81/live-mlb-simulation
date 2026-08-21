import { describe, expect, it } from 'vitest'
import type { Play, PlayEvent, RunnerMovement } from '../../api/types'
import { resolveOutcomeChoreography, resolvePitchChoreography } from '../choreography'
import { FIELDER_POSITIONS_NORMALIZED } from '../coordinates'
import type { BallFlightStep, FielderMoveStep, RunnerMoveStep, TextPopStep } from '../types'

function makeRunner(overrides: Partial<RunnerMovement> & { runnerId: number }): RunnerMovement {
  return {
    movement: { start: null, end: null, outBase: null, isOut: false, ...overrides.movement },
    details: { runner: { id: overrides.runnerId }, isScoringEvent: false, ...overrides.details },
  }
}

function makePlay(overrides: Partial<Play>): Play {
  return {
    about: { atBatIndex: 0, halfInning: 'top', inning: 1, isComplete: true, isScoringPlay: false },
    result: { type: 'atBat', awayScore: 0, homeScore: 0 },
    count: { balls: 0, strikes: 0, outs: 0 },
    matchup: { batter: { id: 1 }, pitcher: { id: 2 } },
    runners: [],
    playEvents: [],
    ...overrides,
  }
}

describe('resolvePitchChoreography', () => {
  it('produces a single mound-to-home ball flight step', () => {
    const steps = resolvePitchChoreography({ isPitch: true, index: 0, type: 'pitch', details: {}, pitchData: { startSpeed: 95 } })
    expect(steps).toHaveLength(1)
    expect(steps[0].kind).toBe('ballFlight')
  })

  it('scales duration inversely with pitch speed', () => {
    const fast = resolvePitchChoreography({
      isPitch: true,
      index: 0,
      type: 'pitch',
      details: {},
      pitchData: { startSpeed: 100 },
    })[0] as BallFlightStep
    const slow = resolvePitchChoreography({
      isPitch: true,
      index: 0,
      type: 'pitch',
      details: {},
      pitchData: { startSpeed: 65 },
    })[0] as BallFlightStep

    expect(fast.durationMs).toBeLessThan(slow.durationMs)
  })
})

describe('resolveOutcomeChoreography', () => {
  it('moves a runner from first to third through second on a single', () => {
    const play = makePlay({
      result: { type: 'atBat', event: 'Single', eventType: 'single', awayScore: 0, homeScore: 0 },
      runners: [
        makeRunner({ runnerId: 1, movement: { start: null, end: '1B', outBase: null, isOut: false } }),
        makeRunner({ runnerId: 2, movement: { start: '1B', end: '3B', outBase: null, isOut: false } }),
      ],
      playEvents: [
        {
          isPitch: true,
          index: 0,
          type: 'pitch',
          details: { isInPlay: true },
          hitData: { trajectory: 'line_drive', totalDistance: 150, coordinates: { coordX: 100, coordY: 120 } },
        } satisfies PlayEvent,
      ],
    })

    const steps = resolveOutcomeChoreography(play)
    const runnerSteps = steps.filter((s): s is RunnerMoveStep => s.kind === 'runnerMove')

    const batterLegs = runnerSteps.filter((s) => s.playerId === 1)
    const advancingRunnerLegs = runnerSteps.filter((s) => s.playerId === 2)

    expect(batterLegs).toHaveLength(1)
    expect(advancingRunnerLegs).toHaveLength(2)
    // second leg should start where the first leg left off
    expect(advancingRunnerLegs[1].from).toEqual(advancingRunnerLegs[0].to)
    expect(advancingRunnerLegs.every((s) => !s.isOut)).toBe(true)
  })

  it('includes a ball flight step using the hit coordinates when the ball was put in play', () => {
    const play = makePlay({
      result: { type: 'atBat', event: 'Single', eventType: 'single', awayScore: 0, homeScore: 0 },
      playEvents: [
        {
          isPitch: true,
          index: 0,
          type: 'pitch',
          details: { isInPlay: true },
          hitData: { trajectory: 'ground_ball', totalDistance: 90, coordinates: { coordX: 150, coordY: 150 } },
        },
      ],
    })

    const steps = resolveOutcomeChoreography(play)
    const ballFlight = steps.find((s): s is BallFlightStep => s.kind === 'ballFlight')
    expect(ballFlight).toBeDefined()
    expect(ballFlight!.arcHeight).toBeLessThan(0.1)
  })

  it('sends the ball to the raw hit coordinate and moves the nearest fielder to meet it, then back', () => {
    const play = makePlay({
      result: { type: 'atBat', event: 'Flyout', eventType: 'field_out', awayScore: 0, homeScore: 0 },
      playEvents: [
        {
          isPitch: true,
          index: 0,
          type: 'pitch',
          details: { isInPlay: true },
          // Deep and toward right field, but not exactly on the right fielder's rendered spot.
          hitData: { trajectory: 'fly_ball', totalDistance: 280, coordinates: { coordX: 200, coordY: 80 } },
        },
      ],
    })

    const steps = resolveOutcomeChoreography(play)
    const ballFlight = steps.find((s): s is BallFlightStep => s.kind === 'ballFlight')
    const fielderSteps = steps.filter((s): s is FielderMoveStep => s.kind === 'fielderMove')

    expect(ballFlight!.to).not.toEqual(FIELDER_POSITIONS_NORMALIZED['9'])
    expect(fielderSteps).toHaveLength(2)
    expect(fielderSteps[0].position).toBe('9')
    expect(fielderSteps[0].to).toEqual(ballFlight!.to)
    // second leg returns them to their default position, in a later group so it doesn't block anything else
    expect(fielderSteps[1].to).toEqual(FIELDER_POSITIONS_NORMALIZED['9'])
    expect(fielderSteps[1].group).toBeGreaterThan(fielderSteps[0].group)
  })

  it('does not move any fielder for a hit, even a fly_ball trajectory home run', () => {
    const play = makePlay({
      result: { type: 'atBat', event: 'Home Run', eventType: 'home_run', awayScore: 1, homeScore: 0 },
      playEvents: [
        {
          isPitch: true,
          index: 0,
          type: 'pitch',
          details: { isInPlay: true },
          hitData: { trajectory: 'fly_ball', totalDistance: 410, coordinates: { coordX: 200, coordY: 80 } },
        },
      ],
    })

    const steps = resolveOutcomeChoreography(play)
    expect(steps.some((s) => s.kind === 'fielderMove')).toBe(false)
  })

  it('pops only a K for a strikeout, with no ballFlight and no runner move/OUT for the batter', () => {
    const play = makePlay({
      result: { type: 'atBat', event: 'Strikeout', eventType: 'strikeout', awayScore: 0, homeScore: 0 },
      // MLB's feed includes a runners[] entry for the batter on a strikeout (their own out) —
      // this must NOT be animated as the batter running to (and being called out at) a base.
      runners: [makeRunner({ runnerId: 1, movement: { start: null, end: null, outBase: '1B', isOut: true } })],
      playEvents: [{ isPitch: true, index: 0, type: 'pitch', details: { isStrike: true } }],
    })

    const steps = resolveOutcomeChoreography(play)
    expect(steps.some((s) => s.kind === 'ballFlight')).toBe(false)
    expect(steps.some((s) => s.kind === 'runnerMove')).toBe(false)
    expect(steps.filter((s) => s.kind === 'textPop')).toHaveLength(1)
    const textPop = steps.find((s): s is TextPopStep => s.kind === 'textPop')
    expect(textPop?.text).toBe('K')
  })

  it('still animates a caught-stealing runner during a strikeout, only skipping the batter', () => {
    const play = makePlay({
      result: { type: 'atBat', event: 'Strikeout', eventType: 'strikeout', awayScore: 0, homeScore: 0 },
      runners: [
        makeRunner({ runnerId: 1, movement: { start: null, end: null, outBase: '1B', isOut: true } }),
        makeRunner({ runnerId: 2, movement: { start: '1B', end: null, outBase: '2B', isOut: true } }),
      ],
      playEvents: [{ isPitch: true, index: 0, type: 'pitch', details: { isStrike: true } }],
    })

    const steps = resolveOutcomeChoreography(play)
    const runnerSteps = steps.filter((s): s is RunnerMoveStep => s.kind === 'runnerMove')
    expect(runnerSteps).toHaveLength(1)
    expect(runnerSteps[0].playerId).toBe(2)
  })

  it('animates a force out to the outBase and tags it as out', () => {
    const play = makePlay({
      result: { type: 'atBat', event: 'Force Out', eventType: 'force_out', awayScore: 0, homeScore: 0 },
      runners: [makeRunner({ runnerId: 3, movement: { start: '1B', end: null, outBase: '2B', isOut: true, outNumber: 1 } })],
      playEvents: [
        { isPitch: true, index: 0, type: 'pitch', details: { isInPlay: true }, hitData: { trajectory: 'ground_ball', coordinates: { coordX: 130, coordY: 160 } } },
      ],
    })

    const steps = resolveOutcomeChoreography(play)
    const runnerStep = steps.find((s): s is RunnerMoveStep => s.kind === 'runnerMove' && s.playerId === 3)
    expect(runnerStep?.isOut).toBe(true)
    const outCall = steps.find((s): s is TextPopStep => s.kind === 'textPop' && s.text === 'OUT')
    expect(outCall).toBeDefined()
    // ground outs move a fielder to field the ball too, not just fly outs
    expect(steps.some((s) => s.kind === 'fielderMove')).toBe(true)
  })

  it('adds a celebration step for a home run', () => {
    const play = makePlay({
      result: { type: 'atBat', event: 'Home Run', eventType: 'home_run', awayScore: 1, homeScore: 0 },
      runners: [makeRunner({ runnerId: 1, movement: { start: null, end: 'score', outBase: null, isOut: false }, details: { runner: { id: 1 }, isScoringEvent: true } })],
      playEvents: [
        { isPitch: true, index: 0, type: 'pitch', details: { isInPlay: true }, hitData: { trajectory: 'fly_ball', totalDistance: 410, coordinates: { coordX: 125, coordY: 20 } } },
      ],
    })

    const steps = resolveOutcomeChoreography(play)
    expect(steps.some((s) => s.kind === 'celebration')).toBe(true)
    const ballFlight = steps.find((s): s is BallFlightStep => s.kind === 'ballFlight')
    expect(ballFlight?.arcHeight).toBe(0.4)
  })
})
