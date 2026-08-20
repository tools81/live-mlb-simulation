import type { GameState } from '../../domain/types'
import styles from './ScoreBug.module.css'

interface BaseDiamondProps {
  bases: GameState['bases']
}

export function BaseDiamond({ bases }: BaseDiamondProps) {
  return (
    <svg viewBox="0 0 44 44" className={styles.diamond} aria-label="base runners">
      <rect x="16" y="4" width="12" height="12" transform="rotate(45 22 10)" className={bases.second ? styles.baseOn : styles.baseOff} />
      <rect x="28" y="16" width="12" height="12" transform="rotate(45 34 22)" className={bases.first ? styles.baseOn : styles.baseOff} />
      <rect x="4" y="16" width="12" height="12" transform="rotate(45 10 22)" className={bases.third ? styles.baseOn : styles.baseOff} />
    </svg>
  )
}
