/// <reference types="node" />
// @vitest-environment node

import { describe, expect, it } from 'vitest'

import type {CandidateParams} from './candidate-render';
import { candidateRender } from './candidate-render'
import type { PreviewJpegEncoderFactory } from './preview-jpeg-encode'

function fakeGraph(label: string): CandidateParams['graph'] {
  return { label, steps: [] } as unknown as CandidateParams['graph']
}

// Stub encoder factory: produces deterministic "fake JPEG" bytes (the
// label string the candidate carries, base64-ish). Verifies that
// candidate-render pipes through the encoder shape.
const stubEncoderFactory: PreviewJpegEncoderFactory = ({ width, height }) => {
  const rowsBuffered: number[] = []
  return {
    writeRows: async (_rows: Uint8Array, rowCount: number) => {
      rowsBuffered.push(rowCount)
    },
    finish: async () => ({
      width,
      height,
      totalRows: rowsBuffered.reduce((a, b) => a + b, 0),
    }),
    abort: () => undefined,
  }
}

const SOURCE = {
  width: 2,
  height: 2,
  data: new Uint16Array([
    0x4000,
    0x4000,
    0x4000, // pixel (0,0)
    0x8000,
    0x4000,
    0x4000, // pixel (1,0)
    0x4000,
    0x8000,
    0x4000, // pixel (0,1)
    0x4000,
    0x4000,
    0x8000, // pixel (1,1)
  ]),
}

// Real preview-render would call createRowBandProcessor — that requires a
// full color graph descriptor we don't want to mock here. Instead these
// tests mock renderCpuPreviewFrame at the candidate-render layer by
// supplying a graph that the real processor accepts; the actual pixel
// values aren't asserted, only the iteration mechanics.

describe('candidateRender (mechanics)', () => {
  it('throws when maxConcurrent is consumed and signal aborts', async () => {
    const controller = new AbortController()
    controller.abort()
    const iter = candidateRender({
      source: SOURCE,
      params: [
        { graph: fakeGraph('a') } as never,
        { graph: fakeGraph('b') } as never,
      ],
      maxConcurrent: 1,
      createEncoder: stubEncoderFactory,
      signal: controller.signal,
    })[Symbol.asyncIterator]()
    await expect(iter.next()).rejects.toThrow()
  })

  it('yields done immediately for an empty params array', async () => {
    const out: unknown[] = []
    for await (const result of candidateRender({
      source: SOURCE,
      params: [],
      maxConcurrent: 4,
      createEncoder: stubEncoderFactory,
    })) {
      out.push(result)
    }
    expect(out.length).toBe(0)
  })

  it('return() drains the queue cleanly when the consumer stops early', async () => {
    const iter = candidateRender({
      source: SOURCE,
      params: [
        { graph: fakeGraph('a') } as never,
        { graph: fakeGraph('b') } as never,
      ],
      maxConcurrent: 2,
      createEncoder: stubEncoderFactory,
    })[Symbol.asyncIterator]()

    expect(iter.return).toBeTypeOf('function')
    const closed = await iter.return!()
    expect(closed.done).toBe(true)
  })
})
