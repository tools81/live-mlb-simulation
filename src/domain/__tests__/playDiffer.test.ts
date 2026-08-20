import { describe, expect, it } from 'vitest'
import type { Play, PlayEvent } from '../../api/types'
import { cursorAtEndOf, diffFeed } from '../playDiffer'
import { INITIAL_CURSOR } from '../types'

function makePitch(index: number): PlayEvent {
  return { isPitch: true, index, type: 'pitch', details: { isBall: true } }
}

function makePlay(overrides: Partial<Play> & { atBatIndex: number }): Play {
  return {
    about: {
      atBatIndex: overrides.atBatIndex,
      halfInning: 'top',
      inning: 1,
      isComplete: false,
      isScoringPlay: false,
    },
    result: { type: 'atBat', awayScore: 0, homeScore: 0 },
    count: { balls: 0, strikes: 0, outs: 0 },
    matchup: { batter: { id: 1 }, pitcher: { id: 2 } },
    runners: [],
    playEvents: [],
    ...overrides,
  }
}

describe('diffFeed', () => {
  it('emits a pitch item for each new isPitch playEvent in the in-progress at-bat', () => {
    const play = makePlay({ atBatIndex: 0, playEvents: [makePitch(0), makePitch(1)] })
    const result = diffFeed([play], INITIAL_CURSOR)

    expect(result.newItems).toHaveLength(2)
    expect(result.newItems.every((i) => i.kind === 'pitch')).toBe(true)
    expect(result.nextCursor).toEqual({ atBatIndex: 0, eventCount: 2 })
  })

  it('does not re-emit pitches already covered by the cursor', () => {
    const play = makePlay({ atBatIndex: 0, playEvents: [makePitch(0), makePitch(1), makePitch(2)] })
    const result = diffFeed([play], { atBatIndex: 0, eventCount: 2 })

    expect(result.newItems).toHaveLength(1)
    expect(result.nextCursor).toEqual({ atBatIndex: 0, eventCount: 3 })
  })

  it('emits a completedPlay item once an at-bat completes, and advances the cursor past it', () => {
    const play = makePlay({
      atBatIndex: 0,
      playEvents: [makePitch(0)],
      about: { atBatIndex: 0, halfInning: 'top', inning: 1, isComplete: true, isScoringPlay: false },
    })
    const result = diffFeed([play], INITIAL_CURSOR)

    expect(result.newItems.map((i) => i.kind)).toEqual(['pitch', 'completedPlay'])
    expect(result.nextCursor).toEqual({ atBatIndex: 1, eventCount: 0 })
  })

  it('does not re-emit a completed play on a later diff when no new at-bat has started', () => {
    const play = makePlay({
      atBatIndex: 0,
      playEvents: [makePitch(0)],
      about: { atBatIndex: 0, halfInning: 'top', inning: 1, isComplete: true, isScoringPlay: false },
    })
    const first = diffFeed([play], INITIAL_CURSOR)
    const second = diffFeed([play], first.nextCursor)

    expect(second.newItems).toHaveLength(0)
    expect(second.nextCursor).toEqual(first.nextCursor)
  })

  it('picks up a new at-bat that starts after a completed one', () => {
    const completed = makePlay({
      atBatIndex: 0,
      playEvents: [makePitch(0)],
      about: { atBatIndex: 0, halfInning: 'top', inning: 1, isComplete: true, isScoringPlay: false },
    })
    const inProgress = makePlay({ atBatIndex: 1, playEvents: [makePitch(0)] })

    const first = diffFeed([completed], INITIAL_CURSOR)
    const second = diffFeed([completed, inProgress], first.nextCursor)

    expect(second.newItems).toEqual([{ kind: 'pitch', play: inProgress, event: inProgress.playEvents[0] }])
    expect(second.nextCursor).toEqual({ atBatIndex: 1, eventCount: 1 })
  })
})

describe('cursorAtEndOf', () => {
  it('returns the initial cursor for an empty feed', () => {
    expect(cursorAtEndOf([])).toEqual({ atBatIndex: -1, eventCount: 0 })
  })

  it('points past the last play when it is complete', () => {
    const play = makePlay({
      atBatIndex: 4,
      playEvents: [makePitch(0)],
      about: { atBatIndex: 4, halfInning: 'top', inning: 2, isComplete: true, isScoringPlay: false },
    })
    expect(cursorAtEndOf([play])).toEqual({ atBatIndex: 5, eventCount: 0 })
  })

  it('points at the in-progress play and its event count when the last play is incomplete', () => {
    const play = makePlay({ atBatIndex: 4, playEvents: [makePitch(0), makePitch(1)] })
    expect(cursorAtEndOf([play])).toEqual({ atBatIndex: 4, eventCount: 2 })
  })
})
