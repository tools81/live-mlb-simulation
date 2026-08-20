export interface ExternalStore<T> {
  getSnapshot: () => T
  subscribe: (listener: () => void) => () => void
  set: (value: T) => void
}

/** A minimal store compatible with React's useSyncExternalStore, for state mutated outside the render cycle. */
export function createExternalStore<T>(initial: T): ExternalStore<T> {
  let value = initial
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set: (next) => {
      value = next
      for (const listener of listeners) listener()
    },
  }
}
