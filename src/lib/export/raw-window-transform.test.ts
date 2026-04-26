import { describe, expect, it } from 'vitest'

import {
  applyCameraToWorkingRgbInPlace,
  mapOutputRectToRawWindow,
} from './raw-window-transform'

describe('mapOutputRectToRawWindow', () => {
  it('maps output strips into raw-space windows with visible crop offset and halo', () => {
    expect(
      mapOutputRectToRawWindow({
        output: { x: 0, y: 64, width: 4000, height: 64 },
        visibleCrop: { x: 24, y: 20, width: 4000, height: 3000 },
        rawWidth: 4048,
        rawHeight: 3040,
        halo: 2,
      }),
    ).toEqual({
      rawInput: { x: 24, y: 82, width: 4000, height: 68 },
      outputWithinWindow: { x: 0, y: 2, width: 4000, height: 64 },
    })
  })

  it('clamps top-left halo expansion to the visible crop boundary', () => {
    expect(
      mapOutputRectToRawWindow({
        output: { x: 0, y: 0, width: 100, height: 50 },
        visibleCrop: { x: 10, y: 20, width: 400, height: 300 },
        rawWidth: 500,
        rawHeight: 400,
        halo: 2,
      }),
    ).toEqual({
      rawInput: { x: 10, y: 20, width: 102, height: 52 },
      outputWithinWindow: { x: 0, y: 0, width: 100, height: 50 },
    })
  })

  it('clamps bottom-right halo expansion to the visible crop boundary', () => {
    expect(
      mapOutputRectToRawWindow({
        output: { x: 300, y: 250, width: 100, height: 50 },
        visibleCrop: { x: 10, y: 20, width: 400, height: 300 },
        rawWidth: 500,
        rawHeight: 400,
        halo: 2,
      }),
    ).toEqual({
      rawInput: { x: 308, y: 268, width: 102, height: 52 },
      outputWithinWindow: { x: 2, y: 2, width: 100, height: 50 },
    })
  })

  it('rejects output rectangles outside the visible crop', () => {
    expect(() =>
      mapOutputRectToRawWindow({
        output: { x: 399, y: 0, width: 2, height: 1 },
        visibleCrop: { x: 10, y: 20, width: 400, height: 300 },
        rawWidth: 500,
        rawHeight: 400,
        halo: 2,
      }),
    ).toThrow('Output rect must be fully contained within the visible raw crop.')
  })
})

describe('applyCameraToWorkingRgbInPlace', () => {
  it('converts demosaiced camera RGB into linear ProPhoto working RGB', () => {
    const rgb = new Float32Array([0.25, 0.5, 1])

    applyCameraToWorkingRgbInPlace(rgb, {
      whiteBalance: [2, 1, 1, 1],
      cameraToWorkingRgb: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      workingSpace: 'linear-prophoto-rgb',
    })

    expect(Array.from(rgb)).toEqual([0.5, 0.5, 1])
  })
})
