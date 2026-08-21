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

export function gameStateReducer(state: GameState, action: GameStateAction): GameState {
  switch (action.type) {
    case 'hydrate':
      return action.state

    case 'atBatStarted': {
      const { matchup, about } = action.play
      if (state.batterId === matchup.batter.id && state.pitcherId === matchup.pitcher.id) return state
      return {
        ...state,
        batterId: matchup.batter.id,
        pitcherId: matchup.pitcher.id,
        inning: about.inning,
        half: about.halfInning,
        balls: 0,
        strikes: 0,
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
      return {
        ...state,
        bases: applyRunnerMovements(state.bases, play.runners),
        outs: play.count.outs,
        inning: play.about.inning,
        half: play.about.halfInning,
        awayScore: play.result.awayScore,
        homeScore: play.result.homeScore,
        balls: 0,
        strikes: 0,
        lastPlayDescription: play.result.description ?? state.lastPlayDescription,
        isScoringPlay: play.about.isScoringPlay,
      }
    }

    case 'reconciled':
      return { ...state, bases: action.bases, outs: action.outs, awayScore: action.awayScore, homeScore: action.homeScore }
  }
}
