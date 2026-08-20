import { buildHeadshotUrl } from '../../api/images'
import styles from './Headshot.module.css'

interface HeadshotProps {
  mlbId: number
  name: string
  size?: number
}

export function Headshot({ mlbId, name, size = 48 }: HeadshotProps) {
  return (
    <span className={styles.headshot} style={{ width: size, height: size }}>
      <img src={buildHeadshotUrl(mlbId)} alt={name} loading="lazy" />
    </span>
  )
}
