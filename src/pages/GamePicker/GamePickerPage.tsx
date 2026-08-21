import { GameCard } from '../../components/GameCard/GameCard'
import { HEAVY_TOOL_LOGO_URL } from '../../config/constants'
import { useSchedule } from '../../hooks/useSchedule'
import styles from './GamePickerPage.module.css'

export function GamePickerPage() {
  const { todaysGames, recentCompletedGames, loading, error } = useSchedule()

  return (
    <div className={styles.page}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Live MLB Simulation</h1>
        <img className={styles.logo} src={HEAVY_TOOL_LOGO_URL} alt="Heavy Tool Studios" />
      </div>
      <p className={styles.subtitle}>Pick a game to jump into the on-field simulation.</p>

      {error && <p className={styles.empty}>Couldn't load the schedule: {error.message}</p>}

      <h2 className={styles.sectionTitle}>Today's Games</h2>
      {!loading && todaysGames.length === 0 && <p className={styles.empty}>No games scheduled today.</p>}
      <div className={styles.grid}>
        {todaysGames.map((game) => (
          <GameCard key={game.gamePk} game={game} />
        ))}
      </div>

      <h2 className={styles.sectionTitle}>Recently Completed</h2>
      {!loading && recentCompletedGames.length === 0 && <p className={styles.empty}>No completed games in the last few days.</p>}
      <div className={styles.grid}>
        {recentCompletedGames.map((game) => (
          <GameCard key={game.gamePk} game={game} />
        ))}
      </div>
    </div>
  )
}
