import type { GameFeed, PlayerRef } from '../../api/types'
import { Headshot } from '../Headshot/Headshot'
import styles from './OnDeckPanel.module.css'

interface OnDeckPanelProps {
  feed: GameFeed
}

function Row({ label, player }: { label: string; player?: PlayerRef }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      {player ? (
        <>
          <Headshot mlbId={player.id} name={player.fullName} size={32} />
          <span className={styles.name}>{player.fullName}</span>
        </>
      ) : (
        <span className={styles.empty}>—</span>
      )}
    </div>
  )
}

export function OnDeckPanel({ feed }: OnDeckPanelProps) {
  const { offense } = feed.liveData.linescore
  return (
    <div className={styles.card}>
      <Row label="On Deck" player={offense.onDeck} />
      <Row label="In Hole" player={offense.inHole} />
    </div>
  )
}
