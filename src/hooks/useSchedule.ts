import { useEffect, useState } from 'react'
import { getSchedule } from '../api/mlbApi'
import type { ScheduleGame } from '../api/types'
import { RECENT_GAMES_LOOKBACK_DAYS } from '../config/constants'
import { recentDateParams } from '../utils/time'

export interface UseScheduleResult {
  todaysGames: ScheduleGame[]
  recentCompletedGames: ScheduleGame[]
  loading: boolean
  error: Error | null
}

/** Today's full slate, plus completed games from the `RECENT_GAMES_LOOKBACK_DAYS` days before today. */
export function useSchedule(): UseScheduleResult {
  const [todaysGames, setTodaysGames] = useState<ScheduleGame[]>([])
  const [recentCompletedGames, setRecentCompletedGames] = useState<ScheduleGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [todayDate, ...pastDates] = recentDateParams(RECENT_GAMES_LOOKBACK_DAYS + 1)
        const [todayResponse, pastResponses] = await Promise.all([
          getSchedule(todayDate),
          Promise.all(pastDates.map((date) => getSchedule(date))),
        ])
        if (cancelled) return

        setTodaysGames(todayResponse.dates.flatMap((d) => d.games))
        setRecentCompletedGames(
          pastResponses
            .flatMap((response) => response.dates.flatMap((d) => d.games))
            .filter((game) => game.status.abstractGameState === 'Final'),
        )
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return { todaysGames, recentCompletedGames, loading, error }
}
