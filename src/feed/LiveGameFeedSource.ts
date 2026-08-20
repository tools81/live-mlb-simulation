import { getLiveFeed } from '../api/mlbApi'
import type { GameFeed } from '../api/types'
import type { GameFeedSource } from './GameFeedSource'

/**
 * Polls feed/live on an interval, using setTimeout-chaining (never setInterval) so a slow request
 * can't overlap the next one, and so a mid-game interval change takes effect on the next cycle
 * without discarding an in-flight fetch.
 */
export class LiveGameFeedSource implements GameFeedSource {
  private listeners = new Set<(feed: GameFeed) => void>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = true
  private gamePk: number
  private intervalMs: number

  constructor(gamePk: number, intervalMs: number) {
    this.gamePk = gamePk
    this.intervalMs = intervalMs
  }

  subscribe(listener: (feed: GameFeed) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setInterval(ms: number): void {
    this.intervalMs = ms
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.scheduleNext(0)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private scheduleNext(delayMs: number): void {
    this.timer = setTimeout(() => void this.tick(), delayMs)
  }

  private async tick(): Promise<void> {
    if (this.stopped) return
    try {
      const feed = await getLiveFeed(this.gamePk)
      if (this.stopped) return
      for (const listener of this.listeners) listener(feed)
    } catch (error) {
      console.error('[LiveGameFeedSource] poll failed', error)
    } finally {
      if (!this.stopped) this.scheduleNext(this.intervalMs)
    }
  }
}
