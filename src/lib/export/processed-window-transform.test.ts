import type { LumaRawProcessedWindow } from '@lumaforge/luma-raw-runtime'
import { describe, expect, it } from 'vitest'

import { processedWindowToLinearProPhotoTile } from './processed-window-transform'

function makeWindow(
  overrides: Partial<LumaRawProcessedWindow> = {},
): LumaRawProcessedWindow {
  return {
    rect: { x: 0, y: 0, width: 2, height: 1 },
    workingSpace: 'linear-prophoto-rgb',
    data: new Uint16Array([0, 32768, 65535, 65535, 0, 32768]),
    width: 2,
    height: 1,
    stride: 6,
    normalized: false,
    orientationApplied: true,
    colorApplied: true,
    warnings: [],
    ...overrides,
  }
}

describe('processedWindowToLinearProPhotoTile', () => {
  it('normalizes LibRaw RGB16 windows into linear ProPhoto float tiles', () => {
    const tile = processedWindowToLinearProPhotoTile(makeWindow(), {
      x: 0,
      y: 0,
      width: 2,
      height: 1,
    })

    expect(tile.width).toBe(2)
    expect(tile.height).toBe(1)
    expect(Array.from(tile.data)).toEqual([
      0,
      Math.fround(32768 / 65535),
      1,
      1,
      0,
      Math.fround(32768 / 65535),
    ])
  })

  it.each([
    ['not oriented', { orientationApplied: false }],
    ['not color-applied', { colorApplied: false }],
    ['wrong working space', { workingSpace: 'display-srgb-preview' }],
    ['already normalized', { normalized: true }],
  ])('rejects processed windows that are %s', (_name, overrides) => {
    expect(() =>
      processedWindowToLinearProPhotoTile(
        makeWindow(overrides as Partial<LumaRawProcessedWindow>),
        { x: 0, y: 0, width: 2, height: 1 },
      ),
    ).toThrow('FULL_RES_EXPORT_INVALID_PROCESSED_WINDOW')
  })

  it.each([
    ['stride mismatch', { stride: 5 }],
    ['data length mismatch', { data: new Uint16Array(5) }],
    ['unsafe dimensions', { width: Number.MAX_SAFE_INTEGER, height: 2 }],
  ])('rejects processed windows with %s', (_name, overrides) => {
    expect(() =>
      processedWindowToLinearProPhotoTile(
        makeWindow(overrides as Partial<LumaRawProcessedWindow>),
        { x: 0, y: 0, width: 2, height: 1 },
      ),
    ).toThrow('FULL_RES_EXPORT_INVALID_PROCESSED_WINDOW')
  })

  it('rejects processed windows whose rect does not match the requested output rect', () => {
    expect(() =>
      processedWindowToLinearProPhotoTile(makeWindow(), {
        x: 0,
        y: 1,
        width: 2,
        height: 1,
      }),
    ).toThrow('FULL_RES_EXPORT_INVALID_PROCESSED_WINDOW')
  })
})
