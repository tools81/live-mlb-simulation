import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameFeed, Play } from '../../api/types'

vi.mock('../../api/mlbApi', () => ({ getLiveFeed: vi.fn() }))

import { getLiveFeed } from '../../api/mlbApi'
import { ReplayGameFeedSource } from '../ReplayGameFeedSource'

function makePlay(atBatIndex: number, eventCount: number, isComplete = true): Play {
  return {
    about: { atBatIndex, halfInning: 'top', inning: 1, isComplete, isScoringPlay: false },
    result: { type: 'atBat', awayScore: 0, homeScore: 0 },
    count: { balls: 0, strikes: 0, outs: 0 },
    matchup: { batter: { id: 1 }, pitcher: { id: 2 } },
    runners: [],
    playEvents: Array.from({ length: eventCount }, (_, i) => ({ isPitch: true, index: i, type: 'pitch', details: {} })),
  } as unknown as Play
}

function makeFeed(plays: Play[]): GameFeed {
  return {
    gameData: { status: { abstractGameState: 'Final', detailedState: 'Final' } },
    liveData: { plays: { allPlays: plays } },
  } as unknown as GameFeed
}

describe('ReplayGameFeedSource', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(getLiveFeed).mockResolvedValue(makeFeed([makePlay(0, 5)]))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(getLiveFeed).mockReset()
  })

  it('applies a new interval immediately when idling between reveals, not after the old interval elapses', async () => {
    const source = new ReplayGameFeedSource(1, 5000)
    const listener = vi.fn()
    source.subscribe(listener)
    source.start()

    // First reveal fires right away (scheduleNext(0)); this settles us into idling with a 5000ms wait armed.
    await vi.advanceTimersByTimeAsync(0)
    expect(listener).toHaveBeenCalledTimes(1)

    // Switching to a much shorter interval should apply right away, not after the stale 5000ms wait.
    source.setInterval(200)
    await vi.advanceTimersByTimeAsync(200)
    expect(listener).toHaveBeenCalledTimes(2)

    source.stop()
  })

  it('does not double-schedule when the interval changes mid-fetch', async () => {
    const source = new ReplayGameFeedSource(1, 1000)
    let resolveFeed: (feed: GameFeed) => void = () => {}
    vi.mocked(getLiveFeed).mockReset()
    vi.mocked(getLiveFeed).mockReturnValue(new Promise((resolve) => (resolveFeed = resolve)))

    const listener = vi.fn()
    source.subscribe(listener)
    source.start()

    // start() -> scheduleNext(0) -> tick() begins, awaiting the (still-pending) feed fetch.
    await vi.advanceTimersByTimeAsync(0)
    expect(listener).not.toHaveBeenCalled()

    // Changing the interval while the fetch is in flight must not race the tick's own reschedule.
    source.setInterval(9000)

    resolveFeed(makeFeed([makePlay(0, 5)]))
    await vi.advanceTimersByTimeAsync(0)
    expect(listener).toHaveBeenCalledTimes(1)

    // Only one further tick should be scheduled (at the new interval), not two competing ones.
    await vi.advanceTimersByTimeAsync(9000)
    expect(listener).toHaveBeenCalledTimes(2)

    source.stop()
  })

  it('setInterval is a no-op once stopped', async () => {
    const source = new ReplayGameFeedSource(1, 1000)
    const listener = vi.fn()
    source.subscribe(listener)
    source.start()
    await vi.advanceTimersByTimeAsync(0)
    source.stop()

    source.setInterval(50)
    await vi.advanceTimersByTimeAsync(1000)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('eventually reveals the final play as complete in its own snapshot, and reports isExhausted only at that point', async () => {
    // A game's very last play is where the reveal cursor previously rolled over to "the next
    // play" in the same step that finished revealing the current one -- since there is no next
    // play, that fully-revealed/complete moment was never actually emitted to any listener.
    const plays = [makePlay(0, 2), makePlay(1, 1)]
    vi.mocked(getLiveFeed).mockResolvedValue(makeFeed(plays))

    const source = new ReplayGameFeedSource(824474, 100)
    const snapshots: GameFeed[] = []
    const exhaustedAtEachEmit: boolean[] = []
    source.subscribe((feed) => {
      snapshots.push(feed)
      exhaustedAtEachEmit.push(source.isExhausted())
    })

    source.start()
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(100)
    }

    expect(snapshots.length).toBeGreaterThan(0)

    const finalSnapshotPlays = snapshots[snapshots.length - 1].liveData.plays.allPlays
    const finalPlay = finalSnapshotPlays[finalSnapshotPlays.length - 1]
    expect(finalPlay.about.atBatIndex).toBe(1)
    expect(finalPlay.about.isComplete).toBe(true)

    expect(exhaustedAtEachEmit[exhaustedAtEachEmit.length - 1]).toBe(true)
    expect(exhaustedAtEachEmit.slice(0, -1).every((v) => v === false)).toBe(true)
  })

  it('never marks itself exhausted while an earlier play is what just got revealed', async () => {
    const plays = [makePlay(0, 1), makePlay(1, 1), makePlay(2, 1)]
    vi.mocked(getLiveFeed).mockResolvedValue(makeFeed(plays))

    const source = new ReplayGameFeedSource(824474, 100)
    const exhaustedAtEachEmit: boolean[] = []
    source.subscribe(() => {
      exhaustedAtEachEmit.push(source.isExhausted())
    })

    source.start()
    // First tick (scheduled with 0 delay by start()) reveals only play 0 -- nowhere near exhausted.
    await vi.advanceTimersByTimeAsync(0)

    expect(exhaustedAtEachEmit).toEqual([false])
  })
})
