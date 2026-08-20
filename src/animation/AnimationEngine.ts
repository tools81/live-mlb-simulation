import type { GameFeed, Linescore, Play } from '../api/types'
import { resolveOutcomeChoreography, resolvePitchChoreography } from '../domain/choreography'
import { diffFeed } from '../domain/playDiffer'
import { reconcileWithLinescore, reconstructGameStateAsOf } from '../domain/reconciliation'
import { gameStateReducer } from '../domain/gameStateReducer'
import type { Cursor, GameState, QueueItem } from '../domain/types'
import type { FieldController } from '../pixi/FieldController'
import { PlayQueue } from './PlayQueue'
import { StepRunner } from './StepRunner'

type Mode = 'live' | 'replay'

function basesEqual(a: GameState['bases'], b: GameState['bases']): boolean {
  return a.first === b.first && a.second === b.second && a.third === b.third
}

/**
 * Owns the play queue and the "lockstep" GameState, draining one queue item's choreography at a
 * time so DOM panels (via subscribe/getState) never get ahead of what's actually been animated.
 */
export class AnimationEngine {
  private queue = new PlayQueue()
  private stepRunner: StepRunner
  private state: GameState
  private listeners = new Set<() => void>()
  private draining = false
  private allPlaysSeen: Play[] = []
  private latestLinescore: Linescore | null = null
  private field: FieldController
  private mode: Mode

  constructor(field: FieldController, mode: Mode, initialState: GameState) {
    this.field = field
    this.mode = mode
    this.stepRunner = new StepRunner(field)
    this.state = initialState
    this.field.snapBases(this.state.bases)
    this.field.setBatter(this.state.batterId)
    this.field.setPitcher(this.state.pitcherId)
  }

  getState = (): GameState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  private setState(next: GameState): void {
    this.state = next
    this.emit()
  }

  /** Feeds a fresh feed snapshot (live poll or a synthesized replay tick) in against the given cursor, returning the cursor to store for next time. */
  ingest(feed: GameFeed, cursor: Cursor): Cursor {
    this.allPlaysSeen = feed.liveData.plays.allPlays
    this.latestLinescore = this.mode === 'live' ? feed.liveData.linescore : null

    const diff = diffFeed(feed.liveData.plays.allPlays, cursor)
    this.queue.enqueueAll(diff.newItems)
    void this.drain()
    return diff.nextCursor
  }

  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    let item: QueueItem | undefined
    while ((item = this.queue.dequeue())) {
      await this.processItem(item)
    }
    this.draining = false
  }

  private async processItem(item: QueueItem): Promise<void> {
    const { matchup } = item.play
    if (this.state.batterId !== matchup.batter.id || this.state.pitcherId !== matchup.pitcher.id) {
      this.setState(gameStateReducer(this.state, { type: 'atBatStarted', play: item.play }))
      this.field.setBatter(this.state.batterId)
      this.field.setPitcher(this.state.pitcherId)
    }

    if (item.kind === 'pitch') {
      await this.stepRunner.run(resolvePitchChoreography(item.event))
      this.setState(gameStateReducer(this.state, { type: 'pitchResolved', event: item.event }))
      return
    }

    await this.stepRunner.run(resolveOutcomeChoreography(item.play))
    this.setState(gameStateReducer(this.state, { type: 'playResolved', play: item.play }))

    const expected = reconstructGameStateAsOf(this.allPlaysSeen, item.play.about.atBatIndex)
    const reconciled = reconcileWithLinescore(expected, this.latestLinescore)
    if (!basesEqual(this.state.bases, reconciled.bases) || this.state.outs !== reconciled.outs) {
      this.setState(
        gameStateReducer(this.state, {
          type: 'reconciled',
          bases: reconciled.bases,
          outs: reconciled.outs,
          awayScore: reconciled.awayScore,
          homeScore: reconciled.homeScore,
        }),
      )
      this.field.snapBases(this.state.bases)
    }
  }

  destroy(): void {
    this.listeners.clear()
  }
}
