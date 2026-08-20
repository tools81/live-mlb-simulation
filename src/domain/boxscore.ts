import type { BoxscorePlayer, GameFeed } from '../api/types'

export function findBoxscorePlayer(feed: GameFeed, playerId: number | null): BoxscorePlayer | null {
  if (playerId === null) return null
  const key = `ID${playerId}`
  return feed.liveData.boxscore.teams.home.players[key] ?? feed.liveData.boxscore.teams.away.players[key] ?? null
}
