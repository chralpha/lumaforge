export class TypedBufferPool<T extends ArrayBufferView> {
  private readonly freeList: T[] = []
  private readonly leased = new Set<T>()

  constructor(
    private readonly create: () => T,
    private readonly capacity: number,
  ) {}

  get free(): readonly T[] {
    return [...this.freeList]
  }

  get size() {
    return this.freeList.length
  }

  acquire(): T {
    const buffer = this.freeList.pop() ?? this.create()
    this.leased.add(buffer)
    return buffer
  }

  release(buffer: T): void {
    if (!this.leased.delete(buffer)) {
      throw new Error('Cannot release a buffer that was not acquired from this pool.')
    }

    if (this.freeList.length >= this.capacity) {
      return
    }

    this.freeList.push(buffer)
  }

  clear(): void {
    this.freeList.length = 0
  }
}
