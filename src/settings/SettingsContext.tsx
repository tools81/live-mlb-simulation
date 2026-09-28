import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  DEFAULT_LIVE_POLL_INTERVAL_MS,
  DEFAULT_REPLAY_REVEAL_INTERVAL_MS,
  MAX_POLL_INTERVAL_MS,
  MAX_REPLAY_INTERVAL_MS,
  MIN_POLL_INTERVAL_MS,
  MIN_REPLAY_INTERVAL_MS,
  SETTINGS_STORAGE_KEY,
} from '../config/constants'

export interface Settings {
  pollIntervalMs: number
  replayIntervalMs: number
  narrationMuted: boolean
  geminiApiKey: string
}

const DEFAULT_SETTINGS: Settings = {
  pollIntervalMs: DEFAULT_LIVE_POLL_INTERVAL_MS,
  replayIntervalMs: DEFAULT_REPLAY_REVEAL_INTERVAL_MS,
  narrationMuted: false,
  geminiApiKey: '',
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      pollIntervalMs: clamp(parsed.pollIntervalMs ?? DEFAULT_SETTINGS.pollIntervalMs, MIN_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS),
      replayIntervalMs: clamp(
        parsed.replayIntervalMs ?? DEFAULT_SETTINGS.replayIntervalMs,
        MIN_REPLAY_INTERVAL_MS,
        MAX_REPLAY_INTERVAL_MS,
      ),
      narrationMuted: parsed.narrationMuted ?? DEFAULT_SETTINGS.narrationMuted,
      geminiApiKey: parsed.geminiApiKey ?? DEFAULT_SETTINGS.geminiApiKey,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

interface SettingsContextValue {
  settings: Settings
  setPollIntervalMs: (ms: number) => void
  setReplayIntervalMs: (ms: number) => void
  setNarrationMuted: (muted: boolean) => void
  setGeminiApiKey: (apiKey: string) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const value: SettingsContextValue = {
    settings,
    setPollIntervalMs: (ms) =>
      setSettings((prev) => ({ ...prev, pollIntervalMs: clamp(ms, MIN_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS) })),
    setReplayIntervalMs: (ms) =>
      setSettings((prev) => ({ ...prev, replayIntervalMs: clamp(ms, MIN_REPLAY_INTERVAL_MS, MAX_REPLAY_INTERVAL_MS) })),
    setNarrationMuted: (muted) => setSettings((prev) => ({ ...prev, narrationMuted: muted })),
    setGeminiApiKey: (apiKey) => setSettings((prev) => ({ ...prev, geminiApiKey: apiKey })),
  }

  return <SettingsContext value={value}>{children}</SettingsContext>
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('useSettings must be used within a SettingsProvider')
  return context
}
