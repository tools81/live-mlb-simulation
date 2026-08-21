import { useEffect, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BatterCard } from '../../components/BatterCard/BatterCard'
import { FieldStage } from '../../components/FieldStage/FieldStage'
import { LiveScoresPanel } from '../../components/LiveScoresPanel/LiveScoresPanel'
import { OnDeckPanel } from '../../components/OnDeckPanel/OnDeckPanel'
import { PitcherCard } from '../../components/PitcherCard/PitcherCard'
import { PlayTicker } from '../../components/PlayTicker/PlayTicker'
import { ScoreBug } from '../../components/ScoreBug/ScoreBug'
import { SettingsPanel } from '../../components/SettingsPanel/SettingsPanel'
import type { PositionCode } from '../../domain/coordinates'
import { defendingTeamId, resolveFielderAssignments } from '../../domain/fielders'
import { useAnimationEngine, type SimulationMode } from '../../hooks/useAnimationEngine'
import { useLiveGameState } from '../../hooks/useLiveGameState'
import { useOtherLiveScores } from '../../hooks/useOtherLiveScores'
import { usePixiApp } from '../../hooks/usePixiApp'
import styles from './SimulationPage.module.css'

const ALL_POSITIONS: PositionCode[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export function SimulationPage() {
  const { gamePk: gamePkParam } = useParams()
  const [searchParams] = useSearchParams()
  const gamePk = Number(gamePkParam)
  const mode: SimulationMode = searchParams.get('mode') === 'replay' ? 'replay' : 'live'

  const containerRef = useRef<HTMLDivElement>(null)
  const field = usePixiApp(containerRef)
  const { engine, rawFeed, isPaused, togglePause } = useAnimationEngine(gamePk, mode, field)
  const liveState = useLiveGameState(engine)
  const otherLiveGames = useOtherLiveScores(gamePk)

  useEffect(() => {
    if (!field || !rawFeed) return
    const defendingId = defendingTeamId(liveState.half, rawFeed.gameData)
    const assignments = resolveFielderAssignments(rawFeed, defendingId)
    for (const position of ALL_POSITIONS) {
      field.setFielder(position, assignments[position] ?? null)
    }
  }, [field, rawFeed, liveState.half])

  return (
    <div className={styles.layout}>
      <div className={styles.scorebug}>
        {rawFeed ? <ScoreBug feed={rawFeed} liveState={liveState} /> : <div className={styles.loading}>Loading game…</div>}
      </div>

      <div className={styles.field}>
        <FieldStage containerRef={containerRef} />
      </div>

      <div className={styles.ticker}>
        <PlayTicker description={liveState.lastPlayDescription} isScoringPlay={liveState.isScoringPlay} />
      </div>

      <div className={styles.sidebar}>
        <Link to="/" className={styles.backButton}>
          ← Games
        </Link>
        {rawFeed && (
          <>
            <PitcherCard key={gamePk} feed={rawFeed} pitcherId={liveState.pitcherId} half={liveState.half} />
            <BatterCard feed={rawFeed} batterId={liveState.batterId} />
            <OnDeckPanel feed={rawFeed} />
            <LiveScoresPanel games={otherLiveGames} />
            <SettingsPanel mode={mode} isPaused={isPaused} onTogglePause={togglePause} />
          </>
        )}
      </div>
    </div>
  )
}
