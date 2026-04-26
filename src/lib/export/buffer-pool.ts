export class TypedBufferPool<T extends ArrayBufferView> {
  private readonly free: T[] = []

  constructor(
    private readonly create: () => T,
    private readonly capacity: number,
  ) {}

  get size() {
    return this.free.length
  }

  acquire(): T {
    return this.free.pop() ?? this.create()
  }

  release(buffer: T): void {
    if (this.free.length >= this.capacity) {
      return
    }

    this.free.push(buffer)
  }

  clear(): void {
    this.free.length = 0
  }
}
