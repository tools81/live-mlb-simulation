import type { RefObject } from 'react'
import styles from './FieldStage.module.css'

interface FieldStageProps {
  containerRef: RefObject<HTMLDivElement | null>
}

/** Hosts the PixiJS canvas — the field stage's own animation loop is owned entirely by FieldController via usePixiApp. */
export function FieldStage({ containerRef }: FieldStageProps) {
  return <div ref={containerRef} className={styles.stage} />
}
