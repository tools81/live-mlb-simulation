import type { GameFeed } from '../api/types'
import type { GameState } from './types'

/** Instantly derives the current lockstep state from a live feed snapshot — used to jump into an in-progress game with no backlog replay. */
export function hydrateFromLiveFeed(feed: GameFeed): GameState {
  const { linescore, plays } = feed.liveData
  const currentPlay = plays.currentPlay ?? plays.allPlays[plays.allPlays.length - 1]

  return {
    inning: currentPlay?.about.inning ?? (linescore.innings.length || 1),
    half: currentPlay?.about.halfInning ?? 'top',
    outs: linescore.outs,
    balls: linescore.balls,
    strikes: linescore.strikes,
    awayScore: linescore.teams.away.runs,
    homeScore: linescore.teams.home.runs,
    bases: {
      first: linescore.offense.first?.id ?? null,
      second: linescore.offense.second?.id ?? null,
      third: linescore.offense.third?.id ?? null,
    },
    batterId: linescore.offense.batter?.id ?? null,
    batSide: currentPlay?.matchup.batSide?.code === 'L' ? 'L' : 'R',
    pitcherId: linescore.defense.pitcher?.id ?? null,
    lastPlayDescription: currentPlay?.result.description ?? null,
    isScoringPlay: currentPlay?.about.isScoringPlay ?? false,
    isGameOver: feed.gameData.status.abstractGameState === 'Final',
  }
}
