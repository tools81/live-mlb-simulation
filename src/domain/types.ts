import type { Play, PlayEvent } from '../api/types'
import type { PositionCode } from './coordinates'

export interface NormalizedPoint {
  x: number
  y: number
}

export interface PixelPoint {
  x: number
  y: number
}

export type BaseKey = 'first' | 'second' | 'third'

/** The "lockstep" game state, advanced by the animation engine as each step completes. */
export interface GameState {
  inning: number
  half: 'top' | 'bottom'
  outs: number
  balls: number
  strikes: number
  awayScore: number
  homeScore: number
  bases: Record<BaseKey, number | null>
  batterId: number | null
  /** Which batter's box the batter stands in — switch hitters resolve to whichever side they're actually batting from. */
  batSide: 'L' | 'R'
  pitcherId: number | null
  lastPlayDescription: string | null
  isScoringPlay: boolean
  /** True once the simulation has animated all the way through a completed game -- not just that
   * the real game is over, but that we've actually caught up to its final play. */
  isGameOver: boolean
}

export function createInitialGameState(): GameState {
  return {
    inning: 1,
    half: 'top',
    outs: 0,
    balls: 0,
    strikes: 0,
    awayScore: 0,
    homeScore: 0,
    bases: { first: null, second: null, third: null },
    batterId: null,
    batSide: 'R',
    pitcherId: null,
    lastPlayDescription: null,
    isScoringPlay: false,
    isGameOver: false,
  }
}

/** Last-processed pointer: which at-bat, and how many of its playEvents have been queued. */
export interface Cursor {
  atBatIndex: number
  eventCount: number
}

export const INITIAL_CURSOR: Cursor = { atBatIndex: -1, eventCount: 0 }

export interface QueuedPitchEvent {
  kind: 'pitch'
  play: Play
  event: PlayEvent
}

export interface QueuedCompletedPlay {
  kind: 'completedPlay'
  play: Play
}

export type QueueItem = QueuedPitchEvent | QueuedCompletedPlay

export interface DiffResult {
  newItems: QueueItem[]
  nextCursor: Cursor
}

/** The subset of GameState reconstructable purely from folding over completed plays. */
export interface ReconciledBaseState {
  bases: Record<BaseKey, number | null>
  outs: number
  awayScore: number
  homeScore: number
  inning: number
  half: 'top' | 'bottom'
}

export type EasingFn = (t: number) => number

interface BaseStep {
  group: number
  durationMs: number
  easing?: EasingFn
}

export interface BallFlightStep extends BaseStep {
  kind: 'ballFlight'
  from: NormalizedPoint
  to: NormalizedPoint
  arcHeight: number
  spin: boolean
  /** Tints the ball + its trail for this flight (e.g. by batted-ball trajectory); omitted = natural color. */
  tint?: number
  /** Kicks up small grass-blade particles along the flight path (ground balls). */
  spawnGrassParticles?: boolean
}

export interface RunnerMoveStep extends BaseStep {
  kind: 'runnerMove'
  playerId: number
  from: NormalizedPoint
  to: NormalizedPoint
  isOut: boolean
  isScoring: boolean
}

export interface TextPopStep extends BaseStep {
  kind: 'textPop'
  text: string
  at: NormalizedPoint
  tone: 'neutral' | 'out' | 'good' | 'homerun'
  /** Overrides the default pop font size (e.g. a larger flash for "HOMERUN"). */
  fontSize?: number
}

export interface CelebrationStep extends BaseStep {
  kind: 'celebration'
  at: NormalizedPoint
}

export interface FielderMoveStep extends BaseStep {
  kind: 'fielderMove'
  position: PositionCode
  to: NormalizedPoint
}

export type ChoreographyStep = BallFlightStep | RunnerMoveStep | TextPopStep | CelebrationStep | FielderMoveStep
