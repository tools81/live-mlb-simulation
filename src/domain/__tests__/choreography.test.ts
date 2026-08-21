import { describe, expect, it } from 'vitest'
import type { Play, PlayEvent, RunnerMovement } from '../../api/types'
import { resolveOutcomeChoreography, resolvePitchChoreography } from '../choreography'
import { FIELDER_POSITIONS_NORMALIZED } from '../coordinates'
import type { BallFlightStep, FielderMoveStep, RunnerMoveStep, TextPopStep } from '../types'

function makeRunner(overrides: Partial<RunnerMovement> & { runnerId: number }): RunnerMovement {
  return {
    movement: { start: null, end: null, outBase: null, isOut: false, ...overrides.movement },
    details: { runner: { id: overrides.runnerId }, isScoringEvent: false, ...overrides.details },
    credits: overrides.credits,
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

  it('pops a white BALL/STRIKE/FOUL call after the pitch, positioned right of the catcher', () => {
    const cases: { details: PlayEvent['details']; expected: 'BALL' | 'STRIKE' | 'FOUL' }[] = [
      { details: { isBall: true, call: { code: 'B', description: 'Ball' } }, expected: 'BALL' },
      { details: { isStrike: true, call: { code: 'C', description: 'Called Strike' } }, expected: 'STRIKE' },
      { details: { isStrike: true, call: { code: 'S', description: 'Swinging Strike' } }, expected: 'STRIKE' },
      { details: { isStrike: true, call: { code: 'F', description: 'Foul' } }, expected: 'FOUL' },
    ]

    for (const { details, expected } of cases) {
      const steps = resolvePitchChoreography({ isPitch: true, index: 0, type: 'pitch', details })
      const pop = steps.find((s): s is TextPopStep => s.kind === 'textPop')
      expect(pop?.text).toBe(expected)
      expect(pop?.tone).toBe('neutral') // renders in white
      expect(pop!.group).toBeGreaterThan(steps.find((s) => s.kind === 'ballFlight')!.group)
      expect(pop!.at.x).toBeGreaterThan(FIELDER_POSITIONS_NORMALIZED['2'].x)
    }
  })

  it('does not pop a call for a pitch put in play', () => {
    const steps = resolvePitchChoreography({
      isPitch: true,
      index: 0,
      type: 'pitch',
      details: { isInPlay: true, isStrike: true, call: { code: 'X', description: 'In play, out(s)' } },
    })
    expect(steps.some((s) => s.kind === 'textPop')).toBe(false)
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

  it('calls a fly out/pop out/line out "OUT" at the fielder who caught it, and never runs the batter to first', () => {
    for (const trajectory of ['fly_ball', 'popup', 'line_drive'] as const) {
      const play = makePlay({
        result: { type: 'atBat', event: 'Flyout', eventType: 'field_out', awayScore: 0, homeScore: 0 },
        // The feed still marks the batter's own entry "out at 1B" even though they never ran.
        runners: [makeRunner({ runnerId: 1, movement: { start: null, end: null, outBase: '1B', isOut: true } })],
        playEvents: [
          { isPitch: true, index: 0, type: 'pitch', details: { isInPlay: true }, hitData: { trajectory, coordinates: { coordX: 150, coordY: 100 } } },
        ],
      })

      const steps = resolveOutcomeChoreography(play)
      expect(steps.some((s) => s.kind === 'runnerMove')).toBe(false)
      const fielderMove = steps.find((s): s is FielderMoveStep => s.kind === 'fielderMove')
      const outCall = steps.find((s): s is TextPopStep => s.kind === 'textPop' && s.text === 'OUT')
      expect(outCall).toBeDefined()
      expect(outCall?.at).toEqual(fielderMove?.to)
    }
  })

  it('still calls a ground out "OUT" at first base, since the batter really is thrown out there', () => {
    const play = makePlay({
      result: { type: 'atBat', event: 'Groundout', eventType: 'field_out', awayScore: 0, homeScore: 0 },
      runners: [makeRunner({ runnerId: 1, movement: { start: null, end: null, outBase: '1B', isOut: true } })],
      playEvents: [
        { isPitch: true, index: 0, type: 'pitch', details: { isInPlay: true }, hitData: { trajectory: 'ground_ball', coordinates: { coordX: 130, coordY: 160 } } },
      ],
    })

    const steps = resolveOutcomeChoreography(play)
    const runnerStep = steps.find((s): s is RunnerMoveStep => s.kind === 'runnerMove' && s.playerId === 1)
    expect(runnerStep).toBeDefined()
    expect(runnerStep?.isOut).toBe(true)
  })

  it('relays the ball from the fielding fielder to the putout fielder before either resets ("3B to 1B")', () => {
    // Mirrors a real "Matt McLain grounds out, third baseman Blaze Jordan to first baseman Alec
    // Burleson" play's actual credits shape.
    const play = makePlay({
      result: { type: 'atBat', event: 'Groundout', eventType: 'field_out', awayScore: 0, homeScore: 0 },
      runners: [
        makeRunner({
          runnerId: 7,
          movement: { start: null, end: null, outBase: '1B', isOut: true, outNumber: 2 },
          credits: [
            { position: { code: '5' }, credit: 'f_assist' },
            { position: { code: '3' }, credit: 'f_putout' },
          ],
        }),
      ],
      playEvents: [
        {
          isPitch: true,
          index: 0,
          type: 'pitch',
          details: { isInPlay: true },
          hitData: { trajectory: 'ground_ball', totalDistance: 51, coordinates: { coordX: 104.62, coordY: 167.8 } },
        },
      ],
    })

    const steps = resolveOutcomeChoreography(play)
    const fielderSteps = steps.filter((s): s is FielderMoveStep => s.kind === 'fielderMove')

    // Only the fielding fielder (3B) moves -- never the receiving one (1B).
    expect(fielderSteps).toHaveLength(2)
    expect(fielderSteps.every((s) => s.position === '5')).toBe(true)
    expect(fielderSteps[1].to).toEqual(FIELDER_POSITIONS_NORMALIZED['5'])

    // The relay throw goes from where the ball was fielded to 1B's own spot, after the initial
    // batted-ball flight and before the fielder's return trip.
    const allBallFlights = steps.filter((s): s is BallFlightStep => s.kind === 'ballFlight')
    expect(allBallFlights).toHaveLength(2)
    const [initial, relay] = allBallFlights
    expect(relay.from).toEqual(initial.to)
    expect(relay.to).toEqual(FIELDER_POSITIONS_NORMALIZED['3'])
    expect(relay.group).toBeGreaterThan(initial.group)
    expect(fielderSteps[1].group).toBeGreaterThan(relay.group)
  })

  it('relays through every fielder on a multi-out double play, not just the first one credited ("6 to 4 to 3")', () => {
    // Mirrors a real "Sal Stewart grounds into a double play, shortstop JJ Wetherholt to second
    // baseman Bryan Torres to first baseman Alec Burleson" play: MLB splits the one continuous
    // relay across each retired runner's own entry (SS assist -> 2B putout for the first out,
    // then 2B assist -> 1B putout for the second), sharing the 2B fielder at the boundary.
    const play = makePlay({
      result: { type: 'atBat', event: 'Double Play', eventType: 'double_play', awayScore: 0, homeScore: 0 },
      runners: [
        makeRunner({
          runnerId: 21,
          movement: { start: '1B', end: null, outBase: '2B', isOut: true, outNumber: 1 },
          credits: [
            { position: { code: '6' }, credit: 'f_assist' },
            { position: { code: '4' }, credit: 'f_putout' },
          ],
        }),
        makeRunner({
          runnerId: 22,
          movement: { start: null, end: null, outBase: '1B', isOut: true, outNumber: 2 },
          credits: [
            { position: { code: '4' }, credit: 'f_assist' },
            { position: { code: '3' }, credit: 'f_putout' },
          ],
        }),
      ],
      playEvents: [
        {
          isPitch: true,
          index: 0,
          type: 'pitch',
          details: { isInPlay: true },
          hitData: { trajectory: 'ground_ball', totalDistance: 60, coordinates: { coordX: 110, coordY: 160 } },
        },
      ],
    })

    const steps = resolveOutcomeChoreography(play)

    // Only the fielding fielder (SS) ever moves off their spot -- to the ball, then back.
    const fielderSteps = steps.filter((s): s is FielderMoveStep => s.kind === 'fielderMove')
    expect(fielderSteps).toHaveLength(2)
    expect(fielderSteps.every((s) => s.position === '6')).toBe(true)
    expect(fielderSteps[1].to).toEqual(FIELDER_POSITIONS_NORMALIZED['6'])

    // The ball travels: batted to SS, thrown SS -> 2B, thrown 2B -> 1B -- three flights, two relays.
    const allBallFlights = steps.filter((s): s is BallFlightStep => s.kind === 'ballFlight')
    expect(allBallFlights).toHaveLength(3)
    const [initial, relayToSecond, relayToFirst] = allBallFlights
    expect(relayToSecond.from).toEqual(initial.to)
    expect(relayToSecond.to).toEqual(FIELDER_POSITIONS_NORMALIZED['4'])
    expect(relayToFirst.from).toEqual(relayToSecond.to)
    expect(relayToFirst.to).toEqual(FIELDER_POSITIONS_NORMALIZED['3'])

    // Chronological order: fielded -> relay 1 -> relay 2 -> fielder returns.
    expect(relayToSecond.group).toBeGreaterThan(initial.group)
    expect(relayToFirst.group).toBeGreaterThan(relayToSecond.group)
    expect(fielderSteps[1].group).toBeGreaterThan(relayToFirst.group)
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
    expect(ballFlight?.tint).toBe(0xffd54a)
  })

  it('flashes HOMERUN and the distance traveled, both in the same group as the celebration', () => {
    const play = makePlay({
      result: { type: 'atBat', event: 'Home Run', eventType: 'home_run', awayScore: 1, homeScore: 0 },
      runners: [makeRunner({ runnerId: 1, movement: { start: null, end: 'score', outBase: null, isOut: false }, details: { runner: { id: 1 }, isScoringEvent: true } })],
      playEvents: [
        { isPitch: true, index: 0, type: 'pitch', details: { isInPlay: true }, hitData: { trajectory: 'fly_ball', totalDistance: 410.4, coordinates: { coordX: 125, coordY: 20 } } },
      ],
    })

    const steps = resolveOutcomeChoreography(play)
    const celebration = steps.find((s) => s.kind === 'celebration')
    const textPops = steps.filter((s): s is TextPopStep => s.kind === 'textPop')

    const flash = textPops.find((s) => s.text === 'HOMERUN')
    expect(flash).toBeDefined()
    expect(flash?.tone).toBe('homerun')
    expect(flash?.group).toBe(celebration?.group)

    const distance = textPops.find((s) => s.text === '410 ft')
    expect(distance).toBeDefined()
    expect(distance?.tone).toBe('homerun')
    expect(distance?.group).toBe(celebration?.group)
  })

  it('flashes HOMERUN with no distance line when the feed has no totalDistance', () => {
    const play = makePlay({
      result: { type: 'atBat', event: 'Home Run', eventType: 'home_run', awayScore: 1, homeScore: 0 },
      runners: [makeRunner({ runnerId: 1, movement: { start: null, end: 'score', outBase: null, isOut: false }, details: { runner: { id: 1 }, isScoringEvent: true } })],
      playEvents: [
        { isPitch: true, index: 0, type: 'pitch', details: { isInPlay: true }, hitData: { trajectory: 'fly_ball', coordinates: { coordX: 125, coordY: 20 } } },
      ],
    })

    const steps = resolveOutcomeChoreography(play)
    const textPops = steps.filter((s): s is TextPopStep => s.kind === 'textPop')
    expect(textPops.some((s) => s.text === 'HOMERUN')).toBe(true)
    expect(textPops.some((s) => s.text.endsWith('ft'))).toBe(false)
  })

  it('tints the ball trail by batted-ball trajectory, and kicks up grass only on ground balls', () => {
    const trajectories: { trajectory: string; expectedTint: number }[] = [
      { trajectory: 'ground_ball', expectedTint: 0x5fd15f },
      { trajectory: 'line_drive', expectedTint: 0xe0483e },
      { trajectory: 'fly_ball', expectedTint: 0x4fa8f0 },
      { trajectory: 'popup', expectedTint: 0x4fa8f0 },
    ]

    for (const { trajectory, expectedTint } of trajectories) {
      const play = makePlay({
        result: { type: 'atBat', event: 'Flyout', eventType: 'field_out', awayScore: 0, homeScore: 0 },
        playEvents: [
          { isPitch: true, index: 0, type: 'pitch', details: { isInPlay: true }, hitData: { trajectory, coordinates: { coordX: 150, coordY: 150 } } },
        ],
      })

      const steps = resolveOutcomeChoreography(play)
      const ballFlight = steps.find((s): s is BallFlightStep => s.kind === 'ballFlight')
      expect(ballFlight?.tint).toBe(expectedTint)
      expect(ballFlight?.spawnGrassParticles).toBe(trajectory === 'ground_ball')
    }
  })

  it('leaves an untracked trajectory (e.g. missing hitData) with no tint', () => {
    const play = makePlay({
      result: { type: 'atBat', event: 'Field Out', eventType: 'field_out', awayScore: 0, homeScore: 0 },
      playEvents: [
        { isPitch: true, index: 0, type: 'pitch', details: { isInPlay: true }, hitData: { coordinates: { coordX: 130, coordY: 190 } } },
      ],
    })

    const steps = resolveOutcomeChoreography(play)
    const ballFlight = steps.find((s): s is BallFlightStep => s.kind === 'ballFlight')
    expect(ballFlight?.tint).toBeUndefined()
    expect(ballFlight?.spawnGrassParticles).toBe(false)
  })
})
