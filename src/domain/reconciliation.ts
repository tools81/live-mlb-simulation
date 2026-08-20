import type { Linescore, Play } from '../api/types'
import { applyRunnerMovements } from './baseState'
import type { ReconciledBaseState } from './types'

/**
 * Folds every completed play up through `uptoAtBatIndexInclusive` to derive the expected base
 * occupancy, outs, score, and inning as of that point — the canonical reconciliation source for
 * both live and replay modes, since it only depends on data every play (live or historical)
 * already carries.
 */
export function reconstructGameStateAsOf(allPlays: Play[], uptoAtBatIndexInclusive: number): ReconciledBaseState {
  let bases: ReconciledBaseState['bases'] = { first: null, second: null, third: null }
  let outs = 0
  let awayScore = 0
  let homeScore = 0
  let inning = 1
  let half: 'top' | 'bottom' = 'top'

  for (const play of allPlays) {
    if (play.about.atBatIndex > uptoAtBatIndexInclusive) break
    if (!play.about.isComplete) continue

    if (play.about.inning !== inning || play.about.halfInning !== half) {
      // A new half-inning always starts with the bases clear, even if a prior play left a runner
      // stranded (their own runners[] entry may never explicitly say "removed").
      bases = { first: null, second: null, third: null }
    }
    inning = play.about.inning
    half = play.about.halfInning
    bases = applyRunnerMovements(bases, play.runners)
    outs = play.count.outs
    awayScore = play.result.awayScore
    homeScore = play.result.homeScore
  }

  return { bases, outs, awayScore, homeScore, inning, half }
}

/**
 * Live-mode-only secondary sanity check: MLB's own `linescore.offense` reflects real-time base
 * occupancy for free, so when it disagrees with the runners[]-fold it is trusted as the
 * correction (self-healing any drift from a missed/misinterpreted event upstream).
 */
export function reconcileWithLinescore(expected: ReconciledBaseState, linescore: Linescore | null): ReconciledBaseState {
  if (!linescore) return expected

  const offense = linescore.offense
  const linescoreHasOffenseData =
    offense.batter !== undefined || offense.first !== undefined || offense.second !== undefined || offense.third !== undefined
  if (!linescoreHasOffenseData) return expected

  const fromLinescore: ReconciledBaseState['bases'] = {
    first: offense.first?.id ?? null,
    second: offense.second?.id ?? null,
    third: offense.third?.id ?? null,
  }

  const basesMatch =
    fromLinescore.first === expected.bases.first &&
    fromLinescore.second === expected.bases.second &&
    fromLinescore.third === expected.bases.third
  const outsMatch = linescore.outs === expected.outs

  if (basesMatch && outsMatch) return expected

  console.warn('[reconciliation] drift detected between runners[] reconstruction and linescore; trusting linescore', {
    expected,
    fromLinescore,
    linescoreOuts: linescore.outs,
  })
  return { ...expected, bases: fromLinescore, outs: linescore.outs }
}
