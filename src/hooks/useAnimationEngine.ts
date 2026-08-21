import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getLiveFeed } from '../api/mlbApi'
import type { GameFeed } from '../api/types'
import { AnimationEngine } from '../animation/AnimationEngine'
import { BASEBALL_ICON_URL, STADIUM_IMAGE_URL } from '../config/constants'
import { createInitialGameState, INITIAL_CURSOR, type Cursor } from '../domain/types'
import { hydrateFromLiveFeed } from '../domain/hydrate'
import { cursorAtEndOf } from '../domain/playDiffer'
import type { GameFeedSource } from '../feed/GameFeedSource'
import { LiveGameFeedSource } from '../feed/LiveGameFeedSource'
import { ReplayGameFeedSource } from '../feed/ReplayGameFeedSource'
import type { FieldController } from '../pixi/FieldController'
import { prefetchRoster } from '../pixi/textures'
import { useSettings } from '../settings/SettingsContext'
import { createExternalStore } from './createExternalStore'

export type SimulationMode = 'live' | 'replay'

export interface UseAnimationEngineResult {
  engine: AnimationEngine | null
  rawFeed: GameFeed | null
}

/** Owns the full setup pipeline for one game: loads assets, prefetches the roster, hydrates the initial state, and wires a feed source into the AnimationEngine. StrictMode-safe. */
export function useAnimationEngine(gamePk: number, mode: SimulationMode, field: FieldController | null): UseAnimationEngineResult {
  const { settings } = useSettings()
  const [engine, setEngine] = useState<AnimationEngine | null>(null)
  const rawFeedStore = useRef(createExternalStore<GameFeed | null>(null)).current
  const rawFeed = useSyncExternalStore(rawFeedStore.subscribe, rawFeedStore.getSnapshot)
  const sourceRef = useRef<GameFeedSource | null>(null)

  useEffect(() => {
    if (!field) return
    let cancelled = false
    let localEngine: AnimationEngine | null = null
    let source: GameFeedSource | null = null

    async function setup() {
      if (!field) return
      await Promise.all([field.loadStadiumBackground(STADIUM_IMAGE_URL), field.loadBallTexture(BASEBALL_ICON_URL)])
      if (cancelled) return

      const initialFeed = await getLiveFeed(gamePk)
      if (cancelled) return

      const roster = Object.values(initialFeed.gameData.players)
      field.loadRoster(roster)
      await prefetchRoster(
        field.renderer,
        roster.map((player) => player.id),
      )
      if (cancelled) return

      rawFeedStore.set(initialFeed)

      const initialState = mode === 'live' ? hydrateFromLiveFeed(initialFeed) : createInitialGameState()
      let cursor: Cursor = mode === 'live' ? cursorAtEndOf(initialFeed.liveData.plays.allPlays) : INITIAL_CURSOR

      localEngine = new AnimationEngine(field, mode, initialState)
      setEngine(localEngine)

      const intervalMs = mode === 'live' ? settings.pollIntervalMs : settings.replayIntervalMs
      source = mode === 'live' ? new LiveGameFeedSource(gamePk, intervalMs) : new ReplayGameFeedSource(gamePk, intervalMs)
      sourceRef.current = source

      source.subscribe((feed) => {
        rawFeedStore.set(feed)
        cursor = localEngine!.ingest(feed, cursor)
      })
      source.start()
    }

    setup().catch((error) => console.error('[useAnimationEngine] setup failed', error))

    return () => {
      cancelled = true
      source?.stop()
      sourceRef.current = null
      localEngine?.destroy()
      setEngine(null)
      rawFeedStore.set(null)
    }
    // Intentionally excludes `settings` — the initial interval is captured once here; later
    // changes are pushed to the running source by the effect below without tearing everything down.
  }, [field, gamePk, mode])

  useEffect(() => {
    sourceRef.current?.setInterval(mode === 'live' ? settings.pollIntervalMs : settings.replayIntervalMs)
  }, [mode, settings.pollIntervalMs, settings.replayIntervalMs])

  return { engine, rawFeed }
}
