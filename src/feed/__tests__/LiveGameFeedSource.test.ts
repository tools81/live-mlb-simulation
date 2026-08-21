import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameFeed } from '../../api/types'

vi.mock('../../api/mlbApi', () => ({
  getLiveFeed: vi.fn(),
}))

import { getLiveFeed } from '../../api/mlbApi'
import { LiveGameFeedSource } from '../LiveGameFeedSource'

function makeFeed(abstractGameState: 'Live' | 'Final'): GameFeed {
  return {
    gameData: { status: { abstractGameState, detailedState: abstractGameState } },
    liveData: { plays: { allPlays: [] } },
  } as unknown as GameFeed
}

describe('LiveGameFeedSource', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('reports isExhausted only once a poll comes back with the real game marked Final', async () => {
    const mocked = vi.mocked(getLiveFeed)
    mocked.mockResolvedValueOnce(makeFeed('Live'))
    mocked.mockResolvedValueOnce(makeFeed('Final'))

    const source = new LiveGameFeedSource(824474, 100)
    const exhaustedAtEachEmit: boolean[] = []
    source.subscribe(() => {
      exhaustedAtEachEmit.push(source.isExhausted())
    })

    source.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(exhaustedAtEachEmit).toEqual([false])

    await vi.advanceTimersByTimeAsync(100)
    expect(exhaustedAtEachEmit).toEqual([false, true])
  })
})
