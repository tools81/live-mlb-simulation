import type { GameFeed } from '../../api/types'
import type { GameState } from '../../domain/types'
import styles from './ScoreBug.module.css'

const REGULATION_INNINGS = 9

interface LineScoreProps {
  feed: GameFeed
  liveState: GameState
}

/** Inning-by-inning runs plus R/H/E, as a grid. Innings not yet reached stay blank. */
export function LineScore({ feed, liveState }: LineScoreProps) {
  const { teams } = feed.gameData
  const { inning, half, isGameOver, inningRuns, hits, errors } = liveState
  const inningCount = Math.max(REGULATION_INNINGS, inning)
  const innings = Array.from({ length: inningCount }, (_, i) => i + 1)

  const awayReached = (n: number) => n <= inning
  const homeReached = (n: number) => n < inning || (n === inning && half === 'bottom')
  const cellClass = (n: number, battingHalf: 'top' | 'bottom') =>
    [styles.lineCell, !isGameOver && n === inning && half === battingHalf ? styles.lineCellCurrent : ''].join(' ')

  const homeCell = (n: number) => {
    if (homeReached(n)) return inningRuns.home[n - 1] ?? 0
    // A home team leading after the top of the last inning never bats -- the classic "X".
    return isGameOver && n === inning ? 'X' : ''
  }

  return (
    <div
      className={styles.lineScore}
      style={{ gridTemplateColumns: `auto repeat(${inningCount}, minmax(1.5em, auto)) repeat(3, minmax(1.8em, auto))` }}
      role="table"
      aria-label="Line score"
    >
      <span className={[styles.lineHeader, styles.lineCorner].join(' ')} />
      {innings.map((n) => (
        <span key={n} className={styles.lineHeader}>
          {n}
        </span>
      ))}
      <span className={[styles.lineHeader, styles.lineTotalFirst].join(' ')}>R</span>
      <span className={styles.lineHeader}>H</span>
      <span className={styles.lineHeader}>E</span>

      <span className={styles.lineTeam}>{teams.away.abbreviation}</span>
      {innings.map((n) => (
        <span key={n} className={cellClass(n, 'top')}>
          {awayReached(n) ? (inningRuns.away[n - 1] ?? 0) : ''}
        </span>
      ))}
      <span className={[styles.lineTotal, styles.lineTotalFirst].join(' ')}>{liveState.awayScore}</span>
      <span className={styles.lineTotal}>{hits.away}</span>
      <span className={styles.lineTotal}>{errors.away}</span>

      <span className={styles.lineTeam}>{teams.home.abbreviation}</span>
      {innings.map((n) => (
        <span key={n} className={cellClass(n, 'bottom')}>
          {homeCell(n)}
        </span>
      ))}
      <span className={[styles.lineTotal, styles.lineTotalFirst].join(' ')}>{liveState.homeScore}</span>
      <span className={styles.lineTotal}>{hits.home}</span>
      <span className={styles.lineTotal}>{errors.home}</span>
    </div>
  )
}
