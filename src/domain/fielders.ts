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
 * Best-effort current defensive alignment: pitcher/catcher come from `linescore.defense` (always
 * accurate), the remaining 7 positions are inferred from the fielding team's boxscore entries
 * whose `position.code` matches and who have recorded stats in today's game (a proxy for "active
 * in the current lineup" — imperfect around mid-game defensive substitutions, acceptable for a
 * decorative, non-gameplay-critical layer).
 */
export function resolveFielderAssignments(feed: GameFeed, defendingId: number): Partial<Record<PositionCode, number>> {
  const assignments: Partial<Record<PositionCode, number>> = {}
  const { linescore, boxscore } = feed.liveData

  if (linescore.defense.pitcher) assignments['1'] = linescore.defense.pitcher.id
  if (linescore.defense.catcher) assignments['2'] = linescore.defense.catcher.id

  const team = boxscore.teams.home.team.id === defendingId ? boxscore.teams.home : boxscore.teams.away
  for (const player of Object.values(team.players)) {
    const code = player.position?.code
    if (!code || !isPositionCode(code) || code === '1' || code === '2') continue
    if (assignments[code]) continue
    if (player.stats.batting || player.stats.pitching) assignments[code] = player.person.id
  }

  return assignments
}
