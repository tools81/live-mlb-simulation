import { getLiveFeed } from '../api/mlbApi'
import type { GameFeed } from '../api/types'
import type { GameFeedSource } from './GameFeedSource'

/**
 * Polls feed/live on an interval, using setTimeout-chaining (never setInterval) so a slow request
 * can't overlap the next one. A mid-game interval change applies immediately if we're idling
 * between polls (cancels and reschedules the wait), or on the current fetch's completion if one
 * is in flight -- either way without discarding that in-flight fetch.
 */
export class LiveGameFeedSource implements GameFeedSource {
  private listeners = new Set<(feed: GameFeed) => void>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = true
  private ticking = false
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
    if (!this.stopped && !this.ticking && this.timer) {
      clearTimeout(this.timer)
      this.scheduleNext(this.intervalMs)
    }
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
    this.ticking = true
    try {
      const feed = await getLiveFeed(this.gamePk)
      if (this.stopped) return
      for (const listener of this.listeners) listener(feed)
    } catch (error) {
      console.error('[LiveGameFeedSource] poll failed', error)
    } finally {
      this.ticking = false
      if (!this.stopped) this.scheduleNext(this.intervalMs)
    }
  }
}
