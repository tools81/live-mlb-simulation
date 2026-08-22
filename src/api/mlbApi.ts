import { MLB_API_BASE } from '../config/constants'
import type { GameFeed, ScheduleResponse } from './types'

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`MLB API request failed (${response.status}): ${url}`)
  }
  return (await response.json()) as T
}

/** date is an ISO date string, e.g. "2026-08-20". `hydrate=linescore` adds each game's current inning (only populated once a game is actually underway). */
export function getSchedule(date: string): Promise<ScheduleResponse> {
  const url = `${MLB_API_BASE}/api/v1/schedule?sportId=1&date=${date}&hydrate=linescore`
  return fetchJson<ScheduleResponse>(url)
}

export function getLiveFeed(gamePk: number): Promise<GameFeed> {
  const url = `${MLB_API_BASE}/api/v1.1/game/${gamePk}/feed/live`
  return fetchJson<GameFeed>(url)
}
