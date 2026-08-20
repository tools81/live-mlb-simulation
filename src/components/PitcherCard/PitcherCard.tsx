import { Headshot } from '../Headshot/Headshot'
import type { GameFeed } from '../../api/types'
import { findBoxscorePlayer } from '../../domain/boxscore'
import styles from './PitcherCard.module.css'

interface PitcherCardProps {
  feed: GameFeed
  pitcherId: number | null
}

export function PitcherCard({ feed, pitcherId }: PitcherCardProps) {
  const player = pitcherId !== null ? feed.gameData.players[`ID${pitcherId}`] : null
  const box = findBoxscorePlayer(feed, pitcherId)
  const today = box?.stats.pitching
  const season = box?.seasonStats.pitching

  return (
    <div className={styles.card}>
      <div className={styles.label}>Pitching</div>
      {!player || pitcherId === null ? (
        <p className={styles.empty}>—</p>
      ) : (
        <div className={styles.body}>
          <Headshot mlbId={pitcherId} name={player.fullName} size={56} />
          <div>
            <div className={styles.name}>{player.fullName}</div>
            <div className={styles.statLine}>
              {today?.inningsPitched ?? '0.0'} IP · {today?.strikeOuts ?? 0} K · {today?.pitchesThrown ?? 0} P
            </div>
            <div className={styles.statLine}>
              ERA {season?.era ?? '-.--'} · WHIP {season?.whip ?? '-.--'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
