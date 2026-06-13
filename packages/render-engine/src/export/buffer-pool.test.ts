import { describe, expect, it } from 'vitest'

import { TypedBufferPool } from './buffer-pool'

describe('typedBufferPool', () => {
  it('reuses released Uint16 buffers by length', () => {
    const pool = new TypedBufferPool(() => new Uint16Array(4), 2)

    const first = pool.acquire()
    pool.release(first)
    const reused = pool.acquire()

    expect(reused).toBe(first)
    expect(reused.length).toBe(4)
  })

  it('rejects releases above capacity', () => {
    const pool = new TypedBufferPool(() => new Uint16Array(2), 1)
    const first = pool.acquire()
    const second = pool.acquire()

    pool.release(first)
    pool.release(second)

    expect(pool.size).toBe(1)
    expect(pool.acquire()).toBe(first)
  })

  it('rejects buffers not acquired from the pool', () => {
    const pool = new TypedBufferPool(() => new Uint16Array(2), 1)

    expect(() => pool.release(new Uint16Array(2))).toThrow(
      'Cannot release a buffer that was not acquired from this pool.',
    )
  })

  it('exposes a free snapshot without allowing external mutation of pool storage', () => {
    const pool = new TypedBufferPool(() => new Uint16Array(2), 2)
    const first = pool.acquire()

    pool.release(first)

    const exposed = pool.free as Uint16Array[]
    exposed.push(new Uint16Array([99, 100]))

    expect(pool.size).toBe(1)
    expect(pool.free).toEqual([first])
    expect(pool.acquire()).toBe(first)
  })
})
