import type { QueueItem } from '../domain/types'

export class PlayQueue {
  private items: QueueItem[] = []

  enqueueAll(items: QueueItem[]): void {
    this.items.push(...items)
  }

  dequeue(): QueueItem | undefined {
    return this.items.shift()
  }

  get length(): number {
    return this.items.length
  }
}
