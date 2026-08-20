import { useSyncExternalStore } from 'react'
import type { AnimationEngine } from '../animation/AnimationEngine'
import { createInitialGameState, type GameState } from '../domain/types'

const EMPTY_STATE = createInitialGameState()
const getEmptyState = () => EMPTY_STATE
const emptySubscribe = () => () => {}

/** The lockstep GameState, advanced by the animation engine as it drains each queued step — safe to read directly in render. */
export function useLiveGameState(engine: AnimationEngine | null): GameState {
  return useSyncExternalStore(engine?.subscribe ?? emptySubscribe, engine?.getState ?? getEmptyState)
}
