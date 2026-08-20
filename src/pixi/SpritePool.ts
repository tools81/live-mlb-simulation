export class SpritePool<T> {
  private free: T[] = []
  private factory: () => T

  constructor(factory: () => T) {
    this.factory = factory
  }

  acquire(): T {
    return this.free.pop() ?? this.factory()
  }

  release(item: T): void {
    this.free.push(item)
  }
}
