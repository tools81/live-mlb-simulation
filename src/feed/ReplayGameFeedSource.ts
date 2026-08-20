import { getLiveFeed } from '../api/mlbApi'
import type { GameFeed, Play } from '../api/types'
import type { GameFeedSource } from './GameFeedSource'

/**
 * Fetches an already-final game's feed once, then advances a synthetic reveal cursor one
 * playEvent per tick and emits a truncated `GameFeed`-shaped snapshot at each tick — mirroring
 * how a live poll's `currentPlay` looks mid-at-bat. Because the emitted shape is indistinguishable
 * from a live snapshot, `playDiffer`/`AnimationEngine` need no mode-awareness at all.
 */
export class ReplayGameFeedSource implements GameFeedSource {
  private listeners = new Set<(feed: GameFeed) => void>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = true
  private fullFeed: GameFeed | null = null
  private revealAtBatIndex = 0
  private revealEventCount = 0
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
      if (!this.fullFeed) {
        this.fullFeed = await getLiveFeed(this.gamePk)
      }
      if (this.stopped) return

      const snapshot = this.buildSnapshot()
      if (snapshot) {
        for (const listener of this.listeners) listener(snapshot)
        this.advanceCursor()
      }
    } catch (error) {
      console.error('[ReplayGameFeedSource] tick failed', error)
    } finally {
      if (!this.stopped && this.hasMore()) this.scheduleNext(this.intervalMs)
    }
  }

  private hasMore(): boolean {
    if (!this.fullFeed) return true
    return this.revealAtBatIndex < this.fullFeed.liveData.plays.allPlays.length
  }

  private buildSnapshot(): GameFeed | null {
    if (!this.fullFeed) return null
    const allPlays = this.fullFeed.liveData.plays.allPlays
    if (this.revealAtBatIndex >= allPlays.length) return null

    const revealed = allPlays.slice(0, this.revealAtBatIndex)
    const current = allPlays[this.revealAtBatIndex]
    const revealedEventCount = Math.min(this.revealEventCount, current.playEvents.length)
    const isFullyRevealed = revealedEventCount >= current.playEvents.length

    const partialPlay: Play = {
      ...current,
      playEvents: current.playEvents.slice(0, revealedEventCount),
      about: { ...current.about, isComplete: isFullyRevealed && current.about.isComplete },
    }
    revealed.push(partialPlay)

    return {
      ...this.fullFeed,
      liveData: {
        ...this.fullFeed.liveData,
        plays: { allPlays: revealed, currentPlay: partialPlay },
      },
    }
  }

  private advanceCursor(): void {
    if (!this.fullFeed) return
    const current = this.fullFeed.liveData.plays.allPlays[this.revealAtBatIndex]
    if (!current) return
    this.revealEventCount += 1
    if (this.revealEventCount >= current.playEvents.length) {
      this.revealAtBatIndex += 1
      this.revealEventCount = 0
    }
  }
}
