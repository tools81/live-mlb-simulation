export function buildHeadshotUrl(mlbId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_213,d_people:generic:headshot:silo:current.png,q_auto:best,f_auto/v1/people/${mlbId}/headshot/67/current`
}

export function buildTeamLogoUrl(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/team-cap-on-dark/${teamId}.svg`
}
