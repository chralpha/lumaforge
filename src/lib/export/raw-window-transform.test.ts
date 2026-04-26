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
