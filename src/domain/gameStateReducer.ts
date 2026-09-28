import type { Play, PlayEvent } from '../api/types'
import { applyRunnerMovements } from './baseState'
import type { GameState } from './types'

export type GameStateAction =
  | { type: 'hydrate'; state: GameState }
  /** Fired the moment the engine starts draining a new at-bat's items, even before its pitches finish animating. */
  | { type: 'atBatStarted'; play: Play }
  /** Fired once a pitch's ball-flight step visually completes (crosses the plate). */
  | { type: 'pitchResolved'; event: PlayEvent }
  /** Fired once a completed play's full outcome choreography finishes. */
  | { type: 'playResolved'; play: Play }
  /** Live-mode drift correction — replaces the base/out/score subset without touching batter/pitcher identity. */
  | { type: 'reconciled'; bases: GameState['bases']; outs: number; awayScore: number; homeScore: number }
  /** Fired once the animation queue has fully drained and the underlying game has no more plays left to give. */
  | { type: 'gameEnded' }

function addRuns(runs: number[], inning: number, delta: number): number[] {
  if (delta === 0) return runs
  const next = [...runs]
  next[inning - 1] = Math.max(0, (next[inning - 1] ?? 0) + delta)
  return next
}

/** Credits any change in either team's total to that team's column for `inning`. */
function creditScoreChange(state: GameState, inning: number, awayScore: number, homeScore: number): GameState['inningRuns'] {
  return {
    away: addRuns(state.inningRuns.away, inning, awayScore - state.awayScore),
    home: addRuns(state.inningRuns.home, inning, homeScore - state.homeScore),
  }
}

const HIT_EVENT_TYPES = new Set(['single', 'double', 'triple', 'home_run'])

/** Errors charged on a play -- one error can show up in several runners' credits, so dedupe by the event it happened on. */
function countErrors(play: Play): number {
  const errors = new Set<string>()
  for (const runner of play.runners) {
    for (const { credit, position } of runner.credits ?? []) {
      if (credit.endsWith('_error')) errors.add(`${runner.details.playIndex ?? ''}|${position.code}|${credit}`)
    }
  }
  return errors.size
}

export function gameStateReducer(state: GameState, action: GameStateAction): GameState {
  switch (action.type) {
    case 'hydrate':
      return action.state

    case 'atBatStarted': {
      const { matchup, about } = action.play
      if (state.batterId === matchup.batter.id && state.pitcherId === matchup.pitcher.id) return state
      // A half-inning is (inning, half) together -- top of the 1st and top of the 2nd both read
      // as 'top', but they're different teams' turns at bat and the out count must not carry over.
      const battingTeamChanged = state.inning !== about.inning || state.half !== about.halfInning
      return {
        ...state,
        batterId: matchup.batter.id,
        batSide: matchup.batSide?.code === 'L' ? 'L' : 'R',
        pitcherId: matchup.pitcher.id,
        inning: about.inning,
        half: about.halfInning,
        balls: 0,
        strikes: 0,
        outs: battingTeamChanged ? 0 : state.outs,
      }
    }

    case 'pitchResolved': {
      const { details } = action.event
      if (details.isBall) return { ...state, balls: state.balls + 1 }
      if (details.isStrike) return { ...state, strikes: state.strikes + 1 }
      return state
    }

    case 'playResolved': {
      const { play } = action
      const battingSide = play.about.halfInning === 'top' ? 'away' : 'home'
      const fieldingSide = battingSide === 'away' ? 'home' : 'away'
      return {
        ...state,
        bases: applyRunnerMovements(state.bases, play.runners),
        outs: play.count.outs,
        inning: play.about.inning,
        half: play.about.halfInning,
        awayScore: play.result.awayScore,
        homeScore: play.result.homeScore,
        inningRuns: creditScoreChange(state, play.about.inning, play.result.awayScore, play.result.homeScore),
        // Hits go to the batting team; errors to the team in the field.
        hits: HIT_EVENT_TYPES.has(play.result.eventType ?? '')
          ? { ...state.hits, [battingSide]: state.hits[battingSide] + 1 }
          : state.hits,
        errors: { ...state.errors, [fieldingSide]: state.errors[fieldingSide] + countErrors(play) },
        balls: 0,
        strikes: 0,
        lastPlayDescription: play.result.description ?? state.lastPlayDescription,
        isScoringPlay: play.about.isScoringPlay,
      }
    }

    case 'reconciled':
      return {
        ...state,
        bases: action.bases,
        outs: action.outs,
        awayScore: action.awayScore,
        homeScore: action.homeScore,
        inningRuns: creditScoreChange(state, state.inning, action.awayScore, action.homeScore),
      }

    case 'gameEnded':
      return state.isGameOver ? state : { ...state, isGameOver: true }
  }
}
