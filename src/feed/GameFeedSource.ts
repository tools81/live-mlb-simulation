import type { GameFeed } from '../api/types'

/** Shared interface for both the live poller and the replay source — the diff/queue/animate pipeline downstream never needs to know which one it's talking to. */
export interface GameFeedSource {
  subscribe(listener: (feed: GameFeed) => void): () => void
  start(): void
  stop(): void
  setInterval(ms: number): void
}
