import { describe, expect, it } from 'vitest'
import type { Play, PlayEvent } from '../../api/types'
import { gameStateReducer } from '../gameStateReducer'
import { createInitialGameState } from '../types'

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

describe('gameStateReducer', () => {
  it('picks up the new batter\'s handedness for the batter\'s box, defaulting to right', () => {
    const state = createInitialGameState()

    const lefty = makePlay({
      about: { atBatIndex: 0, inning: 1, halfInning: 'top', isComplete: false, isScoringPlay: false },
      matchup: { batter: { id: 10 }, pitcher: { id: 20 }, batSide: { code: 'L' } },
    })
    expect(gameStateReducer(state, { type: 'atBatStarted', play: lefty }).batSide).toBe('L')

    const righty = makePlay({
      about: { atBatIndex: 1, inning: 1, halfInning: 'top', isComplete: false, isScoringPlay: false },
      matchup: { batter: { id: 11 }, pitcher: { id: 20 }, batSide: { code: 'R' } },
    })
    expect(gameStateReducer(state, { type: 'atBatStarted', play: righty }).batSide).toBe('R')

    const noBatSideData = makePlay({
      about: { atBatIndex: 2, inning: 1, halfInning: 'top', isComplete: false, isScoringPlay: false },
      matchup: { batter: { id: 12 }, pitcher: { id: 20 } },
    })
    expect(gameStateReducer(state, { type: 'atBatStarted', play: noBatSideData }).batSide).toBe('R')
  })

  it('updates inning and half as soon as a new at-bat starts', () => {
    const state = createInitialGameState()
    const play = makePlay({
      about: { atBatIndex: 0, inning: 3, halfInning: 'bottom', isComplete: false, isScoringPlay: false },
      matchup: { batter: { id: 10 }, pitcher: { id: 20 } },
    })

    const next = gameStateReducer(state, { type: 'atBatStarted', play })

    expect(next.inning).toBe(3)
    expect(next.half).toBe('bottom')
    expect(next.batterId).toBe(10)
    expect(next.pitcherId).toBe(20)
    expect(next.balls).toBe(0)
    expect(next.strikes).toBe(0)
  })

  it('resets outs to 0 when the batting team changes, whether the half flips or the inning turns over', () => {
    const midInning = { ...createInitialGameState(), inning: 3, half: 'top' as const, outs: 2 }
    const halfFlip = makePlay({
      about: { atBatIndex: 5, inning: 3, halfInning: 'bottom', isComplete: false, isScoringPlay: false },
      matchup: { batter: { id: 10 }, pitcher: { id: 20 } },
    })
    expect(gameStateReducer(midInning, { type: 'atBatStarted', play: halfFlip }).outs).toBe(0)

    // Same 'top' label as before, but a new inning -- still a different team's turn at bat.
    const endOfBottom = { ...createInitialGameState(), inning: 3, half: 'bottom' as const, outs: 3 }
    const inningTurnover = makePlay({
      about: { atBatIndex: 9, inning: 4, halfInning: 'top', isComplete: false, isScoringPlay: false },
      matchup: { batter: { id: 11 }, pitcher: { id: 21 } },
    })
    expect(gameStateReducer(endOfBottom, { type: 'atBatStarted', play: inningTurnover }).outs).toBe(0)
  })

  it('carries the out count over for the next batter within the same half-inning', () => {
    const oneOut = { ...createInitialGameState(), inning: 2, half: 'top' as const, outs: 1, batterId: 10 }
    const nextBatter = makePlay({
      about: { atBatIndex: 3, inning: 2, halfInning: 'top', isComplete: false, isScoringPlay: false },
      matchup: { batter: { id: 11 }, pitcher: { id: 20 } },
    })
    expect(gameStateReducer(oneOut, { type: 'atBatStarted', play: nextBatter }).outs).toBe(1)
  })

  it('leaves state untouched when the same batter/pitcher recurs (no-op guard)', () => {
    const state = { ...createInitialGameState(), batterId: 10, pitcherId: 20, inning: 3, half: 'bottom' as const }
    const play = makePlay({
      about: { atBatIndex: 0, inning: 3, halfInning: 'bottom', isComplete: false, isScoringPlay: false },
      matchup: { batter: { id: 10 }, pitcher: { id: 20 } },
    })

    const next = gameStateReducer(state, { type: 'atBatStarted', play })

    expect(next).toBe(state)
  })

  it('also updates inning and half when a play resolves, in case atBatStarted was skipped', () => {
    const state = createInitialGameState()
    const play = makePlay({
      about: { atBatIndex: 0, inning: 5, halfInning: 'top', isComplete: true, isScoringPlay: false },
      result: { type: 'atBat', awayScore: 2, homeScore: 1 },
      count: { balls: 0, strikes: 0, outs: 2 },
    })

    const next = gameStateReducer(state, { type: 'playResolved', play })

    expect(next.inning).toBe(5)
    expect(next.half).toBe('top')
    expect(next.outs).toBe(2)
    expect(next.awayScore).toBe(2)
    expect(next.homeScore).toBe(1)
  })

  it('increments balls and strikes as pitches resolve, resetting on the next at-bat', () => {
    let state = createInitialGameState()
    const ball: PlayEvent = { isPitch: true, index: 0, type: 'pitch', details: { isBall: true } }
    const strike: PlayEvent = { isPitch: true, index: 1, type: 'pitch', details: { isStrike: true } }

    state = gameStateReducer(state, { type: 'pitchResolved', event: ball })
    state = gameStateReducer(state, { type: 'pitchResolved', event: strike })
    expect(state.balls).toBe(1)
    expect(state.strikes).toBe(1)

    const nextBatter = makePlay({
      about: { atBatIndex: 1, inning: 1, halfInning: 'top', isComplete: false, isScoringPlay: false },
      matchup: { batter: { id: 99 }, pitcher: { id: 2 } },
    })
    state = gameStateReducer(state, { type: 'atBatStarted', play: nextBatter })
    expect(state.balls).toBe(0)
    expect(state.strikes).toBe(0)
  })

  it('overrides bases/outs/score on reconciliation without touching batter/pitcher/inning', () => {
    const state = { ...createInitialGameState(), batterId: 10, inning: 4, half: 'bottom' as const }

    const next = gameStateReducer(state, {
      type: 'reconciled',
      bases: { first: 55, second: null, third: null },
      outs: 1,
      awayScore: 3,
      homeScore: 2,
    })

    expect(next.bases).toEqual({ first: 55, second: null, third: null })
    expect(next.outs).toBe(1)
    expect(next.awayScore).toBe(3)
    expect(next.homeScore).toBe(2)
    expect(next.batterId).toBe(10)
    expect(next.inning).toBe(4)
    expect(next.half).toBe('bottom')
  })

  it('marks the game over, idempotently', () => {
    const state = createInitialGameState()
    expect(state.isGameOver).toBe(false)

    const ended = gameStateReducer(state, { type: 'gameEnded' })
    expect(ended.isGameOver).toBe(true)

    const endedAgain = gameStateReducer(ended, { type: 'gameEnded' })
    expect(endedAgain).toBe(ended)
  })
})
