import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameFeed } from '../../../api/types'
import { PitcherCard } from '../PitcherCard'

function makePitcher(id: number, fullName: string) {
  return {
    person: { id, fullName },
    stats: { pitching: { inningsPitched: '1.0', strikeOuts: 1, pitchesThrown: 15 } },
    seasonStats: { pitching: { era: '3.00', whip: '1.10' } },
  }
}

function makeFeed(pitchers: { id: number; fullName: string }[]): GameFeed {
  const players: Record<string, unknown> = {}
  const boxPlayers: Record<string, unknown> = {}
  for (const p of pitchers) {
    players[`ID${p.id}`] = { id: p.id, fullName: p.fullName }
    boxPlayers[`ID${p.id}`] = makePitcher(p.id, p.fullName)
  }
  return {
    gameData: { players },
    liveData: {
      boxscore: {
        teams: {
          home: { players: boxPlayers },
          away: { players: {} },
        },
      },
    },
  } as unknown as GameFeed
}

// id 1/2 = the home team's starter and reliever (they always pitch in 'top'); 3 = the away
// team's pitcher (pitches in 'bottom').
const feed = makeFeed([
  { id: 1, fullName: 'Alice Ace' },
  { id: 2, fullName: 'Ben Reliever' },
  { id: 3, fullName: 'Cy Away' },
])

describe('PitcherCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the starting pitcher immediately on first render, with no "Pitching Change" flash', () => {
    render(<PitcherCard feed={feed} pitcherId={1} half="top" />)
    expect(screen.getByText('Alice Ace')).toBeInTheDocument()
    expect(screen.queryByText('Pitching Change')).not.toBeInTheDocument()
  })

  it('flashes "Pitching Change" and hides the old pitcher on a same-team substitution, then reveals the new one', () => {
    const { rerender } = render(<PitcherCard feed={feed} pitcherId={1} half="top" />)
    expect(screen.getByText('Alice Ace')).toBeInTheDocument()

    // Same half ('top') -> the home team's own pitcher changed mid-frame.
    rerender(<PitcherCard feed={feed} pitcherId={2} half="top" />)

    expect(screen.getByText('Pitching Change')).toBeInTheDocument()
    expect(screen.queryByText('Alice Ace')).not.toBeInTheDocument()
    expect(screen.queryByText('Ben Reliever')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1800)
    })

    expect(screen.queryByText('Pitching Change')).not.toBeInTheDocument()
    expect(screen.getByText('Ben Reliever')).toBeInTheDocument()
  })

  it('does not flash when the half-inning flips to the other team, even though the pitcher id changes', () => {
    const { rerender } = render(<PitcherCard feed={feed} pitcherId={1} half="top" />)
    expect(screen.getByText('Alice Ace')).toBeInTheDocument()

    // Different half ('bottom') -> this is just the away team's own pitcher taking the mound,
    // not a substitution for either team.
    rerender(<PitcherCard feed={feed} pitcherId={3} half="bottom" />)

    expect(screen.queryByText('Pitching Change')).not.toBeInTheDocument()
    expect(screen.getByText('Cy Away')).toBeInTheDocument()
  })

  it('still flags a substitution that happens to land right at the start of a half-inning for that team', () => {
    const { rerender } = render(<PitcherCard feed={feed} pitcherId={1} half="top" />)
    // Away team takes their turn (bottom) -- no change for them yet, nothing to flag.
    rerender(<PitcherCard feed={feed} pitcherId={3} half="bottom" />)
    expect(screen.queryByText('Pitching Change')).not.toBeInTheDocument()

    // Home team is back on defense (top again), but with a DIFFERENT pitcher than last time --
    // a real substitution, even though the immediately-prior card showed the away team's guy.
    rerender(<PitcherCard feed={feed} pitcherId={2} half="top" />)

    expect(screen.getByText('Pitching Change')).toBeInTheDocument()
    expect(screen.queryByText('Cy Away')).not.toBeInTheDocument()
    expect(screen.queryByText('Ben Reliever')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1800)
    })
    expect(screen.getByText('Ben Reliever')).toBeInTheDocument()
  })

  it('updates immediately with no interstitial when going from no pitcher to a pitcher', () => {
    const { rerender } = render(<PitcherCard feed={feed} pitcherId={null} half="top" />)
    expect(screen.getByText('—')).toBeInTheDocument()

    rerender(<PitcherCard feed={feed} pitcherId={1} half="top" />)

    expect(screen.queryByText('Pitching Change')).not.toBeInTheDocument()
    expect(screen.getByText('Alice Ace')).toBeInTheDocument()
  })

  it('clears immediately with no interstitial when the pitcher becomes unknown', () => {
    const { rerender } = render(<PitcherCard feed={feed} pitcherId={1} half="top" />)
    rerender(<PitcherCard feed={feed} pitcherId={null} half="top" />)

    expect(screen.queryByText('Pitching Change')).not.toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
