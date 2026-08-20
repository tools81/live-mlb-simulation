import type { SimulationMode } from '../../hooks/useAnimationEngine'
import { useSettings } from '../../settings/SettingsContext'
import styles from './SettingsPanel.module.css'

const LIVE_PRESETS_MS = [2000, 5000, 8000, 10000, 15000, 30000]
const REPLAY_PRESETS_MS = [200, 500, 1000, 1500, 3000, 8000]

interface SettingsPanelProps {
  mode: SimulationMode
}

export function SettingsPanel({ mode }: SettingsPanelProps) {
  const { settings, setPollIntervalMs, setReplayIntervalMs } = useSettings()
  const presets = mode === 'live' ? LIVE_PRESETS_MS : REPLAY_PRESETS_MS
  const value = mode === 'live' ? settings.pollIntervalMs : settings.replayIntervalMs
  const setValue = mode === 'live' ? setPollIntervalMs : setReplayIntervalMs

  return (
    <div className={styles.card}>
      <span className={styles.label}>{mode === 'live' ? 'Poll Interval' : 'Replay Speed'}</span>
      <select className={styles.select} value={value} onChange={(e) => setValue(Number(e.target.value))}>
        {presets.map((ms) => (
          <option key={ms} value={ms}>
            {ms < 1000 ? `${ms}ms` : `${ms / 1000}s`}
          </option>
        ))}
      </select>
    </div>
  )
}
