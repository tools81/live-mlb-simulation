import { useNavigate } from 'react-router-dom'
import { buildTeamLogoUrl } from '../../api/images'
import type { ScheduleGame } from '../../api/types'
import { formatLocalTime } from '../../utils/time'
import styles from './GameCard.module.css'

interface GameCardProps {
  game: ScheduleGame
}

export function GameCard({ game }: GameCardProps) {
  const navigate = useNavigate()
  const isLive = game.status.abstractGameState === 'Live'
  const isFinal = game.status.abstractGameState === 'Final'
  const mode = isFinal ? 'replay' : 'live'

  const statusLabel = isLive ? 'Live' : isFinal ? 'Final' : formatLocalTime(game.gameDate)
  const statusClass = isLive ? styles.statusLive : isFinal ? styles.statusFinal : undefined

  return (
    <button className={styles.card} onClick={() => navigate(`/game/${game.gamePk}?mode=${mode}`)}>
      <span className={[styles.status, statusClass].filter(Boolean).join(' ')}>{statusLabel}</span>
      <span className={styles.teams}>
        <TeamRow teamId={game.teams.away.team.id} name={game.teams.away.team.name} score={game.teams.away.score} showScore={isLive || isFinal} />
        <TeamRow teamId={game.teams.home.team.id} name={game.teams.home.team.name} score={game.teams.home.score} showScore={isLive || isFinal} />
      </span>
      <span className={styles.venue}>{game.venue.name}</span>
    </button>
  )
}

function TeamRow({ teamId, name, score, showScore }: { teamId: number; name: string; score?: number; showScore: boolean }) {
  return (
    <span className={styles.team}>
      <span className={styles.teamInfo}>
        <img src={buildTeamLogoUrl(teamId)} alt="" />
        <span className={styles.teamName}>{name}</span>
      </span>
      {showScore && <span className={styles.score}>{score ?? 0}</span>}
    </span>
  )
}
