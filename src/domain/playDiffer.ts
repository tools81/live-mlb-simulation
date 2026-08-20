import type { Play } from '../api/types'
import type { Cursor, DiffResult, QueueItem } from './types'

/**
 * Pure diff of a fresh `allPlays` array against a previously-recorded cursor. Returns, in order:
 * any new pitch (playEvent) animations within the still-in-progress at-bat, followed by a
 * completed-play item once an at-bat's `about.isComplete` flips true. Mode-agnostic: both the
 * live poller and the replay source feed this the same shape of input.
 */
export function diffFeed(allPlays: Play[], cursor: Cursor): DiffResult {
  const newItems: QueueItem[] = []
  let nextCursor: Cursor = cursor

  for (const play of allPlays) {
    const atBatIndex = play.about.atBatIndex
    if (atBatIndex < cursor.atBatIndex) continue

    const startEvent = atBatIndex === cursor.atBatIndex ? cursor.eventCount : 0
    for (let i = startEvent; i < play.playEvents.length; i++) {
      const event = play.playEvents[i]
      if (event.isPitch) {
        newItems.push({ kind: 'pitch', play, event })
      }
    }

    if (play.about.isComplete) {
      // Advancing the cursor to atBatIndex + 1 as soon as a play completes is what stops the
      // top-of-loop `continue` above from re-emitting this same completed play on a later tick
      // where no new at-bat has started yet.
      newItems.push({ kind: 'completedPlay', play })
      nextCursor = { atBatIndex: atBatIndex + 1, eventCount: 0 }
    } else {
      nextCursor = { atBatIndex, eventCount: play.playEvents.length }
    }
  }

  return { newItems, nextCursor }
}

/** Cursor representing "everything through the current state has already been processed" — used to hydrate live mode without replaying backlog. */
export function cursorAtEndOf(allPlays: Play[]): Cursor {
  if (allPlays.length === 0) return { atBatIndex: -1, eventCount: 0 }
  const last = allPlays[allPlays.length - 1]
  if (last.about.isComplete) {
    return { atBatIndex: last.about.atBatIndex + 1, eventCount: 0 }
  }
  return { atBatIndex: last.about.atBatIndex, eventCount: last.playEvents.length }
}
