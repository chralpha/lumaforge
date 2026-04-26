import { describe, expect, it } from 'vitest'

import { demosaicBilinearRgb } from './demosaic'

describe('demosaicBilinearRgb', () => {
  it('demosaics a 4x4 RGGB raw window with expected normalized RGB values', () => {
    const tile = demosaicBilinearRgb({
      rect: { x: 0, y: 0, width: 4, height: 4 },
      output: { x: 1, y: 1, width: 2, height: 2 },
      cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
      blackLevel: 0,
      whiteLevel: 64,
      data: new Uint16Array([
        64, 32, 48, 16,
        24, 8, 40, 12,
        56, 28, 20, 36,
        44, 4, 52, 60,
      ]),
    })

    expect(tile.width).toBe(2)
    expect(tile.height).toBe(2)
    expect(tile.data.length).toBe(12)
    expect(Array.from(tile.data)).toEqual([
      0.734375,
      0.484375,
      0.125,
      0.53125,
      0.625,
      0.15625,
      0.59375,
      0.4375,
      0.09375,
      0.3125,
      0.609375,
      0.328125,
    ])
  })

  it('fails closed when the requested output rect falls outside the raw window', () => {
    expect(() =>
      demosaicBilinearRgb({
        rect: { x: 0, y: 0, width: 4, height: 4 },
        output: { x: 3, y: 3, width: 2, height: 2 },
        cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
        blackLevel: 0,
        whiteLevel: 64,
        data: new Uint16Array([
          64, 32, 48, 16,
          24, 8, 40, 12,
          56, 28, 20, 36,
          44, 4, 52, 60,
        ]),
      }),
    ).toThrow('Output rect must be fully contained within the raw window rect.')
  })

  it('respects non-rggb CFA parity when reconstructing colors', () => {
    const tile = demosaicBilinearRgb({
      rect: { x: 0, y: 0, width: 4, height: 4 },
      output: { x: 1, y: 1, width: 2, height: 2 },
      cfa: { pattern: 'bggr', xPhase: 0, yPhase: 0 },
      blackLevel: 0,
      whiteLevel: 64,
      data: new Uint16Array([
        64, 32, 48, 16,
        24, 8, 40, 12,
        56, 28, 20, 36,
        44, 4, 52, 60,
      ]),
    })

    expect(Array.from(tile.data)).toEqual([
      0.125,
      0.484375,
      0.734375,
      0.15625,
      0.625,
      0.53125,
      0.09375,
      0.4375,
      0.59375,
      0.328125,
      0.609375,
      0.3125,
    ])
  })

  it('matches full-window demosaic output when adjacent strips include halo rows', () => {
    const full = demosaicBilinearRgb({
      rect: { x: 0, y: 0, width: 4, height: 6 },
      output: { x: 0, y: 1, width: 4, height: 4 },
      cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
      blackLevel: 0,
      whiteLevel: 24,
      data: new Uint16Array([
        1, 2, 3, 4,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16,
        17, 18, 19, 20,
        21, 22, 23, 24,
      ]),
    })

    const topStrip = demosaicBilinearRgb({
      rect: { x: 0, y: 0, width: 4, height: 4 },
      output: { x: 0, y: 1, width: 4, height: 2 },
      cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
      blackLevel: 0,
      whiteLevel: 24,
      data: new Uint16Array([
        1, 2, 3, 4,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16,
      ]),
    })

    const bottomStrip = demosaicBilinearRgb({
      rect: { x: 0, y: 2, width: 4, height: 4 },
      output: { x: 0, y: 3, width: 4, height: 2 },
      cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
      blackLevel: 0,
      whiteLevel: 24,
      data: new Uint16Array([
        9, 10, 11, 12,
        13, 14, 15, 16,
        17, 18, 19, 20,
        21, 22, 23, 24,
      ]),
    })

    expect(Array.from(full.data.slice(0, topStrip.data.length))).toEqual(
      Array.from(topStrip.data),
    )
    expect(Array.from(full.data.slice(topStrip.data.length))).toEqual(
      Array.from(bottomStrip.data),
    )
  })
})
