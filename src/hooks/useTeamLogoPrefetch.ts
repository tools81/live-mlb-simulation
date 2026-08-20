import { useEffect } from 'react'
import { buildTeamLogoUrl } from '../api/images'
import { MLB_TEAM_IDS } from '../config/teams'

/** Warms the browser's image cache for every team logo at app load, so score displays never wait on one. */
export function useTeamLogoPrefetch(): void {
  useEffect(() => {
    for (const teamId of MLB_TEAM_IDS) {
      const img = new Image()
      img.src = buildTeamLogoUrl(teamId)
    }
  }, [])
}
