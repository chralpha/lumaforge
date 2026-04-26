import { describe, expect, it } from 'vitest'

import { demosaicBilinearRgb } from './demosaic'

describe('demosaicBilinearRgb', () => {
  it('produces finite RGB pixels for a 4x4 RGGB raw window', () => {
    const tile = demosaicBilinearRgb({
      rect: { x: 0, y: 0, width: 4, height: 4 },
      output: { x: 1, y: 1, width: 2, height: 2 },
      cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
      blackLevel: 0,
      whiteLevel: 16,
      data: new Uint16Array([
        1, 2, 3, 4,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16,
      ]),
    })

    expect(tile.width).toBe(2)
    expect(tile.height).toBe(2)
    expect(tile.data.length).toBe(12)
    expect(Array.from(tile.data).every(Number.isFinite)).toBe(true)
  })
})
