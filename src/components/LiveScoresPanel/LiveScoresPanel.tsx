import { useNavigate } from 'react-router-dom'
import { buildTeamLogoUrl } from '../../api/images'
import type { ScheduleGame } from '../../api/types'
import styles from './LiveScoresPanel.module.css'

interface LiveScoresPanelProps {
  games: ScheduleGame[]
}

export function LiveScoresPanel({ games }: LiveScoresPanelProps) {
  const navigate = useNavigate()

  return (
    <div className={styles.card}>
      <span className={styles.label}>Other Live Games</span>
      {games.length === 0 && <p className={styles.empty}>No other games in progress.</p>}
      {games.map((game) => (
        <div key={game.gamePk} className={styles.game} onClick={() => navigate(`/game/${game.gamePk}?mode=live`)} role="button" tabIndex={0}>
          <div className={styles.teams}>
            <span className={styles.team}>
              <span className={styles.teamInfo}>
                <img src={buildTeamLogoUrl(game.teams.away.team.id)} alt="" />
                {game.teams.away.team.name}
              </span>
              <span className={styles.score}>{game.teams.away.score ?? 0}</span>
            </span>
            <span className={styles.team}>
              <span className={styles.teamInfo}>
                <img src={buildTeamLogoUrl(game.teams.home.team.id)} alt="" />
                {game.teams.home.team.name}
              </span>
              <span className={styles.score}>{game.teams.home.score ?? 0}</span>
            </span>
          </div>
          {game.linescore && (
            <span className={styles.inning}>
              <span className={styles.inningArrow}>{game.linescore.isTopInning ? '▲' : '▼'}</span>
              {game.linescore.currentInning}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
