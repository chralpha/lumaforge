import { describe, expect, it, vi } from 'vitest'

import { parseCubeLUTOffThread } from './cube-parse-async'
import { parseCubeLUT } from './cube-parser'

function cubeText(size: number): string {
  const lines = [`TITLE "Async Fixture"`, `LUT_3D_SIZE ${size}`]
  const step = 1 / (size - 1)
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        lines.push(
          `${(r * step).toFixed(6)} ${(g * step).toFixed(6)} ${(b * step).toFixed(6)}`,
        )
      }
    }
  }
  return lines.join('\n')
}

describe('parseCubeLUTOffThread', () => {
  it('matches the synchronous parser when no worker is available', async () => {
    const content = cubeText(17)
    const expected = parseCubeLUT(content, { sourceName: 'fixture.cube' })

    const actual = await parseCubeLUTOffThread(content, {
      sourceName: 'fixture.cube',
      workerFactory: () => {
        throw new Error('no worker in this environment')
      },
    })

    expect(actual.title).toBe(expected.title)
    expect(actual.size).toBe(expected.size)
    expect(actual.fingerprint).toBe(expected.fingerprint)
    expect(actual.inputProfile).toBe(expected.inputProfile)
    expect(Array.from(actual.data)).toEqual(Array.from(expected.data))
  })

  it('decodes byte input identically to string input', async () => {
    const content = cubeText(17)
    const bytes = new TextEncoder().encode(content)
    const factory = () => {
      throw new Error('no worker in this environment')
    }

    const fromString = await parseCubeLUTOffThread(content, {
      workerFactory: factory,
    })
    const fromBytes = await parseCubeLUTOffThread(bytes, {
      workerFactory: factory,
    })

    expect(fromBytes.fingerprint).toBe(fromString.fingerprint)
  })

  it('rejects with the parse error from the fallback path', async () => {
    await expect(
      parseCubeLUTOffThread('not a cube', {
        workerFactory: () => {
          throw new Error('no worker in this environment')
        },
      }),
    ).rejects.toThrow()
  })

  it('falls back to the sync parser when the worker errors after creation', async () => {
    const workerLike = {
      postMessage: vi.fn(() => {
        throw new Error('postMessage exploded')
      }),
      terminate: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }

    const result = await parseCubeLUTOffThread(cubeText(17), {
      workerFactory: () => workerLike as never,
    })

    expect(result.size).toBe(17)
    expect(workerLike.terminate).toHaveBeenCalled()
  })
})
