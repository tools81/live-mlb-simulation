import { describe, expect, it } from 'vitest'
import type { BoxscorePlayer, GameFeed } from '../../api/types'
import { defendingTeamId, resolveFielderAssignments } from '../fielders'

function makePlayer(id: number, code: string, hasStats = true): BoxscorePlayer {
  return {
    person: { id, fullName: `Player ${id}` },
    position: { code, abbreviation: code },
    stats: hasStats ? { batting: {} } : {},
    seasonStats: {},
  } as unknown as BoxscorePlayer
}

function makeFeed(overrides: { homeTeamId: number; awayTeamId: number; homePlayers: BoxscorePlayer[]; awayPlayers: BoxscorePlayer[]; staleCatcherId?: number; staleCatcherName?: string }): GameFeed {
  const toRecord = (players: BoxscorePlayer[]) => Object.fromEntries(players.map((p) => [`ID${p.person.id}`, p]))
  return {
    gameData: {},
    liveData: {
      linescore: {
        defense: {
          pitcher: { id: 999, fullName: 'Some Pitcher' },
          ...(overrides.staleCatcherId
            ? { catcher: { id: overrides.staleCatcherId, fullName: overrides.staleCatcherName ?? 'Stale Catcher' } }
            : {}),
        },
      },
      boxscore: {
        teams: {
          home: { team: { id: overrides.homeTeamId, name: 'Home' }, players: toRecord(overrides.homePlayers) },
          away: { team: { id: overrides.awayTeamId, name: 'Away' }, players: toRecord(overrides.awayPlayers) },
        },
      },
    },
  } as unknown as GameFeed
}

describe('resolveFielderAssignments', () => {
  it('picks the catcher from the currently defending team, not a frozen linescore.defense.catcher belonging to the other team', () => {
    const homeCatcher = makePlayer(1, '2')
    const awayCatcher = makePlayer(2, '2')
    const feed = makeFeed({
      homeTeamId: 100,
      awayTeamId: 200,
      homePlayers: [homeCatcher],
      awayPlayers: [awayCatcher],
      // Simulates a replay's one-time-fetched feed: linescore.defense.catcher is frozen to
      // whoever caught the very last play of the real (completed) game.
      staleCatcherId: 2,
    })

    // Home team defending (e.g. top of an inning) -> should get the HOME catcher, even though
    // linescore.defense.catcher points at the away team's catcher.
    expect(resolveFielderAssignments(feed, 100)['2']).toBe(1)

    // Half-inning flips, away team now defending -> should swap to the AWAY catcher.
    expect(resolveFielderAssignments(feed, 200)['2']).toBe(2)
  })

  it('still resolves the pitcher from linescore.defense (redundant with, and masked by, the dedicated pitcher sprite)', () => {
    const feed = makeFeed({ homeTeamId: 100, awayTeamId: 200, homePlayers: [], awayPlayers: [] })
    expect(resolveFielderAssignments(feed, 100)['1']).toBe(999)
  })

  it('still infers the other 7 positions from the defending team boxscore, unaffected by the catcher fix', () => {
    const firstBase = makePlayer(3, '3')
    const shortstop = makePlayer(4, '6')
    const feed = makeFeed({ homeTeamId: 100, awayTeamId: 200, homePlayers: [firstBase, shortstop], awayPlayers: [] })

    const assignments = resolveFielderAssignments(feed, 100)
    expect(assignments['3']).toBe(3)
    expect(assignments['6']).toBe(4)
  })

  it('skips a boxscore entry with no recorded stats (not actually in today\'s game)', () => {
    const bench = makePlayer(5, '2', false)
    const feed = makeFeed({ homeTeamId: 100, awayTeamId: 200, homePlayers: [bench], awayPlayers: [] })

    expect(resolveFielderAssignments(feed, 100)['2']).toBeUndefined()
  })
})

describe('defendingTeamId', () => {
  it('is the home team in the top half and the away team in the bottom half', () => {
    const gameData = { teams: { home: { id: 100 }, away: { id: 200 } } } as unknown as Parameters<typeof defendingTeamId>[1]
    expect(defendingTeamId('top', gameData)).toBe(100)
    expect(defendingTeamId('bottom', gameData)).toBe(200)
  })
})
