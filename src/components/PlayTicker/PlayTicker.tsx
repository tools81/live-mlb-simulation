import styles from './PlayTicker.module.css'

interface PlayTickerProps {
  description: string | null
  isScoringPlay: boolean
}

export function PlayTicker({ description, isScoringPlay }: PlayTickerProps) {
  return (
    <div className={styles.ticker}>
      {description ? (
        <span className={isScoringPlay ? styles.scoring : undefined}>{description}</span>
      ) : (
        <span className={styles.placeholder}>Waiting for the first pitch…</span>
      )}
    </div>
  )
}
