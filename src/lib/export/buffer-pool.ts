export class TypedBufferPool<T extends ArrayBufferView> {
  readonly free: T[] = []
  private readonly leased = new Set<T>()

  constructor(
    private readonly create: () => T,
    private readonly capacity: number,
  ) {}

  get size() {
    return this.free.length
  }

  acquire(): T {
    const buffer = this.free.pop() ?? this.create()
    this.leased.add(buffer)
    return buffer
  }

  release(buffer: T): void {
    if (!this.leased.delete(buffer)) {
      throw new Error('Cannot release a buffer that was not acquired from this pool.')
    }

    if (this.free.length >= this.capacity) {
      return
    }

    this.free.push(buffer)
  }

  clear(): void {
    this.free.length = 0
  }
}
