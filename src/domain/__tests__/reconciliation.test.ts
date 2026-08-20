import { describe, expect, it } from 'vitest'
import type { Linescore, Play } from '../../api/types'
import { reconcileWithLinescore, reconstructGameStateAsOf } from '../reconciliation'

function play(overrides: Partial<Play>): Play {
  return {
    about: { atBatIndex: 0, halfInning: 'top', inning: 1, isComplete: true, isScoringPlay: false },
    result: { type: 'atBat', awayScore: 0, homeScore: 0 },
    count: { balls: 0, strikes: 0, outs: 0 },
    matchup: { batter: { id: 1 }, pitcher: { id: 9 } },
    runners: [],
    playEvents: [],
    ...overrides,
  }
}

describe('reconstructGameStateAsOf', () => {
  it('folds sequential plays into cumulative bases/outs/score', () => {
    const plays: Play[] = [
      play({
        about: { atBatIndex: 0, halfInning: 'top', inning: 1, isComplete: true, isScoringPlay: false },
        count: { balls: 0, strikes: 0, outs: 0 },
        runners: [
          {
            movement: { start: null, end: '1B', outBase: null, isOut: false },
            details: { runner: { id: 101 }, isScoringEvent: false },
          },
        ],
      }),
      play({
        about: { atBatIndex: 1, halfInning: 'top', inning: 1, isComplete: true, isScoringPlay: true },
        count: { balls: 0, strikes: 0, outs: 0 },
        result: { type: 'atBat', awayScore: 1, homeScore: 0 },
        runners: [
          {
            movement: { start: '1B', end: 'score', outBase: null, isOut: false },
            details: { runner: { id: 101 }, isScoringEvent: true },
          },
        ],
      }),
    ]

    const result = reconstructGameStateAsOf(plays, 1)
    expect(result.bases).toEqual({ first: null, second: null, third: null })
    expect(result.awayScore).toBe(1)
  })

  it('clears the bases at a half-inning boundary even if the fielded out did not target the stranded runner', () => {
    const plays: Play[] = [
      play({
        about: { atBatIndex: 0, halfInning: 'top', inning: 1, isComplete: true, isScoringPlay: false },
        count: { balls: 0, strikes: 0, outs: 2 },
        runners: [
          {
            movement: { start: null, end: '2B', outBase: null, isOut: false },
            details: { runner: { id: 101 }, isScoringEvent: false },
          },
        ],
      }),
      play({
        about: { atBatIndex: 1, halfInning: 'top', inning: 1, isComplete: true, isScoringPlay: false },
        count: { balls: 0, strikes: 0, outs: 3 },
        runners: [
          {
            movement: { start: null, end: null, outBase: 'home', isOut: true, outNumber: 3 },
            details: { runner: { id: 202 }, isScoringEvent: false },
          },
        ],
      }),
      play({
        about: { atBatIndex: 2, halfInning: 'bottom', inning: 1, isComplete: true, isScoringPlay: false },
        count: { balls: 0, strikes: 0, outs: 0 },
        runners: [],
      }),
    ]

    const result = reconstructGameStateAsOf(plays, 2)
    expect(result.bases).toEqual({ first: null, second: null, third: null })
    expect(result.outs).toBe(0)
  })

  it('ignores the still-in-progress at-bat', () => {
    const plays: Play[] = [
      play({ about: { atBatIndex: 0, halfInning: 'top', inning: 1, isComplete: false, isScoringPlay: false } }),
    ]
    const result = reconstructGameStateAsOf(plays, 0)
    expect(result.outs).toBe(0)
  })
})

describe('reconcileWithLinescore', () => {
  const expected = { bases: { first: 101, second: null, third: null }, outs: 1, awayScore: 0, homeScore: 0, inning: 1, half: 'top' as const }

  it('returns the expected state unchanged when linescore agrees', () => {
    const linescore = {
      offense: { batter: { id: 5, fullName: 'x' }, first: { id: 101, fullName: 'y' } },
      outs: 1,
    } as Linescore
    expect(reconcileWithLinescore(expected, linescore)).toEqual(expected)
  })

  it('trusts linescore over the fold when they disagree', () => {
    const linescore = {
      offense: { batter: { id: 5, fullName: 'x' }, first: undefined, second: { id: 202, fullName: 'z' } },
      outs: 2,
    } as Linescore
    const result = reconcileWithLinescore(expected, linescore)
    expect(result.bases).toEqual({ first: null, second: 202, third: null })
    expect(result.outs).toBe(2)
  })

  it('skips the check when linescore has no offense data (e.g. game over)', () => {
    const linescore = { offense: {}, outs: 0 } as Linescore
    expect(reconcileWithLinescore(expected, linescore)).toEqual(expected)
  })

  it('skips the check entirely in replay mode (no linescore)', () => {
    expect(reconcileWithLinescore(expected, null)).toEqual(expected)
  })
})
