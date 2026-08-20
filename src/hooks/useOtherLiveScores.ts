import { useEffect, useState } from 'react'
import { getSchedule } from '../api/mlbApi'
import type { ScheduleGame } from '../api/types'
import { toDateParam } from '../utils/time'

const REFRESH_INTERVAL_MS = 20000

/** Other in-progress games' scores for the sidebar panel — its own independent poll, unrelated to the current game's feed. */
export function useOtherLiveScores(excludeGamePk: number): ScheduleGame[] {
  const [games, setGames] = useState<ScheduleGame[]>([])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function tick() {
      try {
        const response = await getSchedule(toDateParam(new Date()))
        if (cancelled) return
        const live = response.dates
          .flatMap((d) => d.games)
          .filter((game) => game.gamePk !== excludeGamePk && game.status.abstractGameState === 'Live')
        setGames(live)
      } catch (error) {
        console.error('[useOtherLiveScores] refresh failed', error)
      } finally {
        if (!cancelled) timer = setTimeout(() => void tick(), REFRESH_INTERVAL_MS)
      }
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [excludeGamePk])

  return games
}
