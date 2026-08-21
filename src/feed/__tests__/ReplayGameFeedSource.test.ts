import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameFeed } from '../../api/types'
import { getLiveFeed } from '../../api/mlbApi'
import { ReplayGameFeedSource } from '../ReplayGameFeedSource'

vi.mock('../../api/mlbApi', () => ({ getLiveFeed: vi.fn() }))

function makeFeed(playEventCount: number): GameFeed {
  return {
    gameData: {},
    liveData: {
      plays: {
        allPlays: [
          {
            about: { atBatIndex: 0, halfInning: 'top', inning: 1, isComplete: false, isScoringPlay: false },
            result: { type: 'atBat', awayScore: 0, homeScore: 0 },
            count: { balls: 0, strikes: 0, outs: 0 },
            matchup: { batter: { id: 1 }, pitcher: { id: 2 } },
            runners: [],
            playEvents: Array.from({ length: playEventCount }, (_, i) => ({
              isPitch: true,
              index: i,
              type: 'pitch',
              details: {},
            })),
          },
        ],
      },
    },
  } as unknown as GameFeed
}

describe('ReplayGameFeedSource', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(getLiveFeed).mockResolvedValue(makeFeed(5))
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

    resolveFeed(makeFeed(5))
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
})
