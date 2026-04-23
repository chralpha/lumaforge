import { describe, expect, it } from 'vitest'

import { convertToFloat32RGBA, planDecodedOutputSize } from './decoder'

describe('rAW decoder output sizing', () => {
  it('keeps decoded dimensions when they fit the pixel budget', () => {
    expect(planDecodedOutputSize(400, 300, 120_000)).toEqual({
      width: 400,
      height: 300,
    })
  })

  it('scales decoded dimensions down while preserving aspect ratio', () => {
    const size = planDecodedOutputSize(8000, 6000, 12_000_000)

    expect(size).toEqual({ width: 4000, height: 3000 })
    expect(size.width * size.height).toBeLessThanOrEqual(12_000_000)
  })

  it('converts RGB source data into capped RGBA float output', () => {
    const source = new Uint8Array([
      255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255,
    ])

    const output = convertToFloat32RGBA(source, 2, 2, 8, 1)

    expect(output.width).toBe(1)
    expect(output.height).toBe(1)
    expect(Array.from(output.data)).toEqual([1, 1, 1, 1])
  })
})
