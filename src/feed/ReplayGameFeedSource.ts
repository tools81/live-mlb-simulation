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
  private ticking = false
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

  isExhausted(): boolean {
    if (!this.fullFeed) return false
    const allPlays = this.fullFeed.liveData.plays.allPlays
    if (this.revealAtBatIndex >= allPlays.length) return true
    // `tick()` calls `advanceReveal()` before building the snapshot a listener receives, so by the
    // time a listener (and thus this) runs, this state already reflects that snapshot correctly.
    if (this.revealAtBatIndex !== allPlays.length - 1) return false
    const current = allPlays[this.revealAtBatIndex]
    return this.revealEventCount >= current.playEvents.length && current.about.isComplete
  }

  setInterval(ms: number): void {
    this.intervalMs = ms
    // If we're just idling between reveals, cancel that stale-duration wait and reschedule with
    // the new interval right away -- otherwise the change wouldn't take effect until whatever the
    // *previous* interval's wait happened to expire, which can be many seconds later. While a tick
    // is actively in flight, leave it alone: it reads `intervalMs` fresh when it reschedules itself.
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
      if (!this.fullFeed) {
        this.fullFeed = await getLiveFeed(this.gamePk)
      }
      if (this.stopped) return

      // Advance *before* building the snapshot, so a play's fully-revealed (isComplete: true)
      // moment is itself something a listener can observe, not just an instant that gets skipped
      // over on the way to the next play. That distinction only bites for a game's very last play:
      // every earlier play's completion is also visible (redundantly) once it lands in the next
      // play's `revealed` prefix, but the last play has no "next" tick to expose it that way --
      // without this, the final out of every replayed game would never resolve at all.
      this.advanceReveal()
      const snapshot = this.buildSnapshot()
      if (snapshot) {
        for (const listener of this.listeners) listener(snapshot)
      }
    } catch (error) {
      console.error('[ReplayGameFeedSource] tick failed', error)
    } finally {
      this.ticking = false
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
    const isFullyRevealed = this.revealEventCount >= current.playEvents.length

    const partialPlay: Play = {
      ...current,
      playEvents: current.playEvents.slice(0, this.revealEventCount),
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

  /** Moves the reveal cursor forward by exactly one unit: reveals one more event of the current
   * play, or -- once that play has already been shown fully revealed in its own snapshot -- steps
   * to the next play. */
  private advanceReveal(): void {
    if (!this.fullFeed) return
    const current = this.fullFeed.liveData.plays.allPlays[this.revealAtBatIndex]
    if (!current) return
    if (this.revealEventCount < current.playEvents.length) {
      this.revealEventCount += 1
    } else {
      this.revealAtBatIndex += 1
      this.revealEventCount = 0
    }
  }
}
