import type { GameData, GameFeed } from '../api/types'
import type { PositionCode } from './coordinates'

const POSITION_CODES: PositionCode[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

function isPositionCode(code: string): code is PositionCode {
  return (POSITION_CODES as string[]).includes(code)
}

export function defendingTeamId(half: 'top' | 'bottom', gameData: GameData): number {
  return half === 'top' ? gameData.teams.home.id : gameData.teams.away.id
}

/**
 * Best-effort current defensive alignment: the pitcher comes from `linescore.defense` (redundant
 * with — and masked by — AnimationEngine's own per-play-accurate pitcher sprite, so any staleness
 * here is invisible). Every other position, catcher included, is inferred from the *currently
 * defending* team's boxscore entries whose `position.code` matches and who have recorded stats in
 * today's game (a proxy for "active in the current lineup" — imperfect around mid-game defensive
 * substitutions, acceptable for a decorative, non-gameplay-critical layer).
 *
 * Catcher used to be sourced from `linescore.defense.catcher` too, but that field is a *live*
 * snapshot — in replay mode the whole feed is fetched once, so it stays frozen at whichever
 * player caught the last play of the real game, for the entire replay, never swapping to the
 * other team's catcher no matter how many half-innings pass. Deriving it from the boxscore (like
 * every other fielder) re-picks the correct team each time `defendingId` changes instead.
 */
export function resolveFielderAssignments(feed: GameFeed, defendingId: number): Partial<Record<PositionCode, number>> {
  const assignments: Partial<Record<PositionCode, number>> = {}
  const { linescore, boxscore } = feed.liveData

  if (linescore.defense.pitcher) assignments['1'] = linescore.defense.pitcher.id

  const team = boxscore.teams.home.team.id === defendingId ? boxscore.teams.home : boxscore.teams.away
  for (const player of Object.values(team.players)) {
    const code = player.position?.code
    if (!code || !isPositionCode(code) || code === '1') continue
    if (assignments[code]) continue
    if (player.stats.batting || player.stats.pitching) assignments[code] = player.person.id
  }

  return assignments
}
