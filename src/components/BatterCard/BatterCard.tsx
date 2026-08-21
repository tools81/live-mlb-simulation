import { Headshot } from '../Headshot/Headshot'
import type { GameFeed } from '../../api/types'
import { battingOrderSpot, findBoxscorePlayer } from '../../domain/boxscore'
import styles from './BatterCard.module.css'

interface BatterCardProps {
  feed: GameFeed
  batterId: number | null
}

function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`
}

export function BatterCard({ feed, batterId }: BatterCardProps) {
  const player = batterId !== null ? feed.gameData.players[`ID${batterId}`] : null
  const box = findBoxscorePlayer(feed, batterId)
  const today = box?.stats.batting
  const season = box?.seasonStats.batting
  const orderSpot = battingOrderSpot(box?.battingOrder)

  return (
    <div className={styles.card}>
      <div className={styles.label}>At Bat</div>
      {!player || batterId === null ? (
        <p className={styles.empty}>—</p>
      ) : (
        <div className={styles.body}>
          <Headshot mlbId={batterId} name={player.fullName} size={56} />
          <div>
            <div className={styles.name}>
              {player.fullName}
              {(orderSpot !== null || box?.position) && (
                <span className={styles.meta}>
                  {orderSpot !== null ? `Batting ${ordinal(orderSpot)}` : null}
                  {orderSpot !== null && box?.position ? ' · ' : null}
                  {box?.position?.abbreviation ?? null}
                </span>
              )}
            </div>
            <div className={styles.statLine}>
              {today?.hits ?? 0}-for-{today?.atBats ?? 0} today
              {today?.homeRuns ? `, ${today.homeRuns} HR` : ''}
              {today?.rbi ? `, ${today.rbi} RBI` : ''}
            </div>
            <div className={styles.statLine}>
              AVG {season?.avg ?? '.---'} · HR {season?.homeRuns ?? 0} · RBI {season?.rbi ?? 0}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
