/// <reference types="node" />
// @vitest-environment node

import { describe, expect, it } from 'vitest'

import type {ContactSheetTile} from './contact-sheet';
import { composeContactSheet  } from './contact-sheet'

function solidTile(
  width: number,
  height: number,
  rgb: readonly [number, number, number],
): ContactSheetTile {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let p = 0; p < width * height; p += 1) {
    const d = p * 4
    rgba[d + 0] = rgb[0]
    rgba[d + 1] = rgb[1]
    rgba[d + 2] = rgb[2]
    rgba[d + 3] = 255
  }
  return { width, height, rgba }
}

describe('composeContactSheet', () => {
  it('paints a 2x2 grid of solid tiles into the correct quadrants', () => {
    const tiles = [
      solidTile(2, 2, [255, 0, 0]),
      solidTile(2, 2, [0, 255, 0]),
      solidTile(2, 2, [0, 0, 255]),
      solidTile(2, 2, [255, 255, 255]),
    ]
    const sheet = composeContactSheet({
      tiles,
      cols: 2,
      rows: 2,
      tileWidth: 2,
      tileHeight: 2,
    })
    expect(sheet.width).toBe(4)
    expect(sheet.height).toBe(4)
    // (0,0) red
    expect(sheet.rgba[0]).toBe(255)
    expect(sheet.rgba[1]).toBe(0)
    // (2,0) green
    const greenStart = 2 * 4
    expect(sheet.rgba[greenStart]).toBe(0)
    expect(sheet.rgba[greenStart + 1]).toBe(255)
    // (0,2) blue
    const blueStart = 2 * sheet.width * 4
    expect(sheet.rgba[blueStart + 2]).toBe(255)
    // (2,2) white
    const whiteStart = (2 * sheet.width + 2) * 4
    expect(sheet.rgba[whiteStart]).toBe(255)
    expect(sheet.rgba[whiteStart + 1]).toBe(255)
    expect(sheet.rgba[whiteStart + 2]).toBe(255)
  })

  it('honors gap between tiles by writing the background colour between them', () => {
    const sheet = composeContactSheet({
      tiles: [solidTile(1, 1, [255, 0, 0]), solidTile(1, 1, [0, 255, 0])],
      cols: 2,
      rows: 1,
      tileWidth: 1,
      tileHeight: 1,
      gap: 1,
      background: [128, 128, 128],
    })
    expect(sheet.width).toBe(3)
    // gap pixel at (1, 0) is background
    const gapStart = 1 * 4
    expect(sheet.rgba[gapStart + 0]).toBe(128)
    expect(sheet.rgba[gapStart + 1]).toBe(128)
    expect(sheet.rgba[gapStart + 2]).toBe(128)
  })

  it('fills empty cells with the background when there are fewer tiles than slots', () => {
    const sheet = composeContactSheet({
      tiles: [solidTile(2, 2, [255, 0, 0])],
      cols: 2,
      rows: 1,
      tileWidth: 2,
      tileHeight: 2,
      background: [10, 20, 30],
    })
    // second cell (x=2..3) is background
    const bgStart = (0 * sheet.width + 2) * 4
    expect(sheet.rgba[bgStart + 0]).toBe(10)
    expect(sheet.rgba[bgStart + 1]).toBe(20)
    expect(sheet.rgba[bgStart + 2]).toBe(30)
  })

  it('rejects tiles whose declared size disagrees with the grid', () => {
    expect(() =>
      composeContactSheet({
        tiles: [solidTile(3, 3, [255, 0, 0])],
        cols: 1,
        rows: 1,
        tileWidth: 2,
        tileHeight: 2,
      }),
    ).toThrow(/TILE_SIZE_MISMATCH/)
  })

  it('rejects tiles whose buffer length disagrees with the declared size', () => {
    expect(() =>
      composeContactSheet({
        tiles: [
          { width: 2, height: 2, rgba: new Uint8ClampedArray(4) }, // wrong length
        ],
        cols: 1,
        rows: 1,
        tileWidth: 2,
        tileHeight: 2,
      }),
    ).toThrow(/TILE_BUFFER_MISMATCH/)
  })
})
