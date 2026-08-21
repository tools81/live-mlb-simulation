import { useEffect, useRef, useState } from 'react'
import { Headshot } from '../Headshot/Headshot'
import type { GameFeed } from '../../api/types'
import { findBoxscorePlayer } from '../../domain/boxscore'
import styles from './PitcherCard.module.css'

interface PitcherCardProps {
  feed: GameFeed
  pitcherId: number | null
  /** Which half-inning is currently live -- 'top'/'bottom' maps 1:1 to a fixed team for the whole
   * game (home always defends in 'top', away in 'bottom'), so it doubles as "which team's pitcher
   * this is" without needing gameData here. */
  half: 'top' | 'bottom'
}

/** How long the "Pitching Change" interstitial stays up before the new pitcher's info appears. */
const PITCHING_CHANGE_DISPLAY_MS = 1800

export function PitcherCard({ feed, pitcherId, half }: PitcherCardProps) {
  const [displayedPitcherId, setDisplayedPitcherId] = useState(pitcherId)
  const [isChanging, setIsChanging] = useState(false)
  const previousPitcherId = useRef(pitcherId)
  // `pitcherId` updates every at-bat, ping-ponging between the two teams as the half-inning
  // flips -- that flip alone must never read as a "pitching change." Tracking the last pitcher
  // seen *for each half* (equivalently, for each team) lets a genuine same-team substitution be
  // told apart from the routine "now it's the other team's turn to defend" transition, even when
  // that substitution happens to land right at the start of a half-inning.
  const lastPitcherByHalf = useRef<{ top: number | null; bottom: number | null }>({
    top: half === 'top' ? pitcherId : null,
    bottom: half === 'bottom' ? pitcherId : null,
  })

  useEffect(() => {
    if (pitcherId === previousPitcherId.current) return
    previousPitcherId.current = pitcherId

    const lastForThisHalf = lastPitcherByHalf.current[half]
    lastPitcherByHalf.current[half] = pitcherId
    const isRealSubstitution = lastForThisHalf !== null && pitcherId !== null && lastForThisHalf !== pitcherId

    if (!isRealSubstitution) {
      setDisplayedPitcherId(pitcherId)
      return
    }

    setIsChanging(true)
    const timer = setTimeout(() => {
      setDisplayedPitcherId(pitcherId)
      setIsChanging(false)
    }, PITCHING_CHANGE_DISPLAY_MS)
    return () => clearTimeout(timer)
  }, [pitcherId, half])

  const player = displayedPitcherId !== null ? feed.gameData.players[`ID${displayedPitcherId}`] : null
  const box = findBoxscorePlayer(feed, displayedPitcherId)
  const today = box?.stats.pitching
  const season = box?.seasonStats.pitching

  return (
    <div className={styles.card}>
      <div className={styles.label}>Pitching</div>
      {isChanging ? (
        <p className={styles.pitchingChange}>Pitching Change</p>
      ) : !player || displayedPitcherId === null ? (
        <p className={styles.empty}>—</p>
      ) : (
        <div className={styles.body}>
          <Headshot mlbId={displayedPitcherId} name={player.fullName} size={56} />
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
