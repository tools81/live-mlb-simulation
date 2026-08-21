import { buildTeamLogoUrl } from '../../api/images'
import type { GameFeed } from '../../api/types'
import { BAT_ICON_URL } from '../../config/constants'
import type { GameState } from '../../domain/types'
import { BaseDiamond } from './BaseDiamond'
import styles from './ScoreBug.module.css'

interface ScoreBugProps {
  feed: GameFeed
  liveState: GameState
}

function Dots({ count, max, className }: { count: number; max: number; className: string }) {
  return (
    <span className={styles.dots}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={[styles.dot, i < count ? className : ''].join(' ')} />
      ))}
    </span>
  )
}

export function ScoreBug({ feed, liveState }: ScoreBugProps) {
  const { teams } = feed.gameData
  const awayBatting = liveState.half === 'top'

  return (
    <div className={styles.bar}>
      <div className={styles.teams}>
        <span className={[styles.teamLine, awayBatting ? styles.batting : ''].join(' ')}>
          <span className={styles.logoWrap}>
            <img className={styles.logo} src={buildTeamLogoUrl(teams.away.id)} alt="" />
            {awayBatting && <img className={styles.batIcon} src={BAT_ICON_URL} alt="At bat" />}
          </span>
          {teams.away.abbreviation}
          <span className={styles.score}>{liveState.awayScore}</span>
        </span>
        <span className={[styles.teamLine, !awayBatting ? styles.batting : ''].join(' ')}>
          <span className={styles.logoWrap}>
            <img className={styles.logo} src={buildTeamLogoUrl(teams.home.id)} alt="" />
            {!awayBatting && <img className={styles.batIcon} src={BAT_ICON_URL} alt="At bat" />}
          </span>
          {teams.home.abbreviation}
          <span className={styles.score}>{liveState.homeScore}</span>
        </span>
      </div>

      <div className={styles.center}>
        <div className={styles.inning}>
          <span className={styles.inningArrow}>{liveState.half === 'top' ? '▲' : '▼'}</span>
          <span className={styles.inningLabel}>{liveState.inning}</span>
        </div>

        <BaseDiamond bases={liveState.bases} />

        <div className={styles.counts}>
          <span className={styles.countRow}>
            B <Dots count={liveState.balls} max={3} className={styles.dotOn} />
          </span>
          <span className={styles.countRow}>
            S <Dots count={liveState.strikes} max={2} className={styles.dotOnStrike} />
          </span>
          <span className={styles.countRow}>
            O <Dots count={liveState.outs} max={2} className={styles.dotOnOut} />
          </span>
        </div>
      </div>

      <div className={styles.hitsErrors}>
        <span>H {feed.liveData.linescore.teams.away.hits}-{feed.liveData.linescore.teams.home.hits}</span>
        <span>E {feed.liveData.linescore.teams.away.errors}-{feed.liveData.linescore.teams.home.errors}</span>
      </div>
    </div>
  )
}
