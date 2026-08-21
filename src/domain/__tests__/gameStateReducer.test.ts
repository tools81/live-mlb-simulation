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
})
