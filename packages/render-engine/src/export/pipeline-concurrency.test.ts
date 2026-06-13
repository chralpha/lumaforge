import { describe, expect, it } from 'vitest'

import {
  normalizeExportConcurrency,
  runOrderedConcurrent,
} from './pipeline-concurrency'

describe('pipeline concurrency', () => {
  it('normalizes requested concurrency into a bounded value', () => {
    expect(normalizeExportConcurrency(undefined, 'safe')).toBe(1)
    expect(normalizeExportConcurrency(undefined, 'balanced')).toBe(2)
    expect(normalizeExportConcurrency(undefined, 'max')).toBe(3)
    expect(normalizeExportConcurrency(2.9, 'safe')).toBe(2)
    expect(normalizeExportConcurrency(8, 'max')).toBe(3)
    expect(normalizeExportConcurrency(0.4, 'max')).toBe(1)
  })

  it.each([Infinity, -Infinity, Number.NaN, 0, -1])(
    'rejects invalid requested concurrency %s',
    (requested) => {
      expect(() => normalizeExportConcurrency(requested, 'balanced')).toThrow(
        'FULL_RES_EXPORT_INVALID_CONCURRENCY',
      )
    },
  )

  it('commits completed work in source order', async () => {
    const committed: number[] = []
    let releaseFirst!: () => void
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const run = runOrderedConcurrent(
      [0, 1, 2],
      2,
      async (value, index) => {
        if (index === 0) {
          await first
        }

        return { index, value }
      },
      async (result) => {
        committed.push(result.value)
      },
    )

    await Promise.resolve()
    expect(committed).toEqual([])

    releaseFirst()
    await run

    expect(committed).toEqual([0, 1, 2])
  })

  it('keeps unfinished and buffered work within the concurrency limit', async () => {
    let active = 0
    let maxActive = 0
    const committed: number[] = []

    await runOrderedConcurrent(
      [0, 1, 2, 3],
      2,
      async (value, index) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await Promise.resolve()
        active -= 1

        return { index, value }
      },
      async (result) => {
        committed.push(result.value)
      },
    )

    expect(maxActive).toBeLessThanOrEqual(2)
    expect(committed).toEqual([0, 1, 2, 3])
  })

  it('counts the committing result against the concurrency limit', async () => {
    const retained = new Set<number>()
    let maxRetained = 0
    let releaseFirstCommit!: () => void
    let firstCommitStarted!: () => void
    const firstCommit = new Promise<void>((resolve) => {
      releaseFirstCommit = resolve
    })
    const firstCommitReady = new Promise<void>((resolve) => {
      firstCommitStarted = resolve
    })

    const run = runOrderedConcurrent(
      [0, 1, 2],
      2,
      async (value, index) => {
        retained.add(index)
        maxRetained = Math.max(maxRetained, retained.size)

        return { index, value }
      },
      async (result) => {
        maxRetained = Math.max(maxRetained, retained.size)

        if (result.index === 0) {
          firstCommitStarted()
          await firstCommit
        }

        retained.delete(result.index)
      },
    )

    await firstCommitReady
    await Promise.resolve()
    await Promise.resolve()

    expect(retained.has(2)).toBe(false)
    expect(maxRetained).toBeLessThanOrEqual(2)

    releaseFirstCommit()
    await run

    expect(maxRetained).toBeLessThanOrEqual(2)
    expect(retained.size).toBe(0)
  })
})
