import type { RunnerMovement } from '../api/types'
import type { BaseKey } from './types'

export function baseKeyOf(code: string | null): BaseKey | null {
  switch (code) {
    case '1B':
      return 'first'
    case '2B':
      return 'second'
    case '3B':
      return 'third'
    default:
      return null
  }
}

/**
 * Applies one play's runners[] movements onto a base-occupancy map. Each runner clears whichever
 * base they started on (if any) and, unless they were put out, occupies their end base (if it's
 * an actual base rather than home/scoring). Bases not mentioned by any runner are left untouched.
 */
export function applyRunnerMovements(
  bases: Record<BaseKey, number | null>,
  runners: RunnerMovement[],
): Record<BaseKey, number | null> {
  const next = { ...bases }
  for (const runner of runners) {
    const startKey = baseKeyOf(runner.movement.start)
    if (startKey) next[startKey] = null

    if (!runner.movement.isOut) {
      const endKey = baseKeyOf(runner.movement.end)
      if (endKey) next[endKey] = runner.details.runner.id
    }
  }
  return next
}
