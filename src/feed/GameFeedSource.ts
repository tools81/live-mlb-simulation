import type { GameFeed } from '../api/types'

/** Shared interface for both the live poller and the replay source — the diff/queue/animate pipeline downstream never needs to know which one it's talking to. */
export interface GameFeedSource {
  subscribe(listener: (feed: GameFeed) => void): () => void
  start(): void
  stop(): void
  setInterval(ms: number): void
  /** True once no further plays will ever arrive -- the real game (live) or the replay's own
   * reveal (replay) has reached its end. Reflects the most recently emitted feed, so it's safe to
   * read from inside a `subscribe` listener. */
  isExhausted(): boolean
}
