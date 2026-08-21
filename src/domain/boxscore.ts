import type { BoxscorePlayer, GameFeed } from '../api/types'

export function findBoxscorePlayer(feed: GameFeed, playerId: number | null): BoxscorePlayer | null {
  if (playerId === null) return null
  const key = `ID${playerId}`
  return feed.liveData.boxscore.teams.home.players[key] ?? feed.liveData.boxscore.teams.away.players[key] ?? null
}

/** The lineup spot (1-9) a "N00"-style battingOrder string represents, or null for a non-starter with no spot (e.g. an unused reliever). */
export function battingOrderSpot(battingOrder: string | undefined): number | null {
  if (!battingOrder) return null
  const spot = Math.floor(Number(battingOrder) / 100)
  return spot >= 1 && spot <= 9 ? spot : null
}
