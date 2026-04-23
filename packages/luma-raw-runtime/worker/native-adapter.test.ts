import { describe, expect, it } from 'vitest'

import { createNativeFactory } from './native-adapter'
import type { LumaRawNativeOpenSettings } from './native-types'

type ProcessorValues = {
  openTimings?: unknown
  thumbnail?: unknown
  image?: unknown
}

const settings = {
  halfSize: true,
  useCameraWb: true,
  outputColor: 4,
  outputBps: 16,
  noAutoBright: true,
  userQual: 0,
  gamm: [1, 1, 1, 1, 0, 0],
} satisfies LumaRawNativeOpenSettings

function createProcessor(values: ProcessorValues) {
  const image = values.image ?? {
    data: new Uint16Array([1, 2, 3]),
    width: 1,
    height: 1,
  }

  return createNativeFactory({
    LumaRawProcessor: class {
      openBuffer(_data: Uint8Array, _settings: LumaRawNativeOpenSettings) {
        return values.openTimings
      }
      readMetadata() {
        return {}
      }
      extractThumbnail() {
        return values.thumbnail
      }
      decodePreview() {
        return image
      }
      decodeHq() {
        return image
      }
      delete() {}
    },
  }).createProcessor()
}

describe('native-adapter', () => {
  it('throws when a thumbnail object has malformed data', () => {
    const processor = createProcessor({
      thumbnail: {
        data: [1, 2, 3],
        width: 1,
        height: 1,
        format: 'jpeg',
      },
    })

    expect(() => processor.extractThumbnail()).toThrow(TypeError)
    expect(() => processor.extractThumbnail()).toThrow(
      'Native RAW thumbnail did not return Uint8Array data.',
    )
  })

  it('returns undefined when thumbnail is unavailable', () => {
    const processor = createProcessor({ thumbnail: undefined })

    expect(processor.extractThumbnail()).toBeUndefined()
  })

  it('throws when decoded image data is not Uint16Array', () => {
    const processor = createProcessor({
      image: {
        data: new Uint8Array([1, 2, 3]),
        width: 1,
        height: 1,
      },
    })

    expect(() => processor.decodePreview()).toThrow(TypeError)
    expect(() => processor.decodePreview()).toThrow(
      'Native RAW image did not return Uint16Array data.',
    )
  })

  it('throws when decoded image dimensions are not positive integers', () => {
    const zeroWidth = createProcessor({
      image: {
        data: new Uint16Array([1, 2, 3]),
        width: 0,
        height: 1,
      },
    })
    const fractionalHeight = createProcessor({
      image: {
        data: new Uint16Array([1, 2, 3]),
        width: 1,
        height: 1.5,
      },
    })

    expect(() => zeroWidth.decodePreview()).toThrow(
      'Native RAW image returned invalid width.',
    )
    expect(() => fractionalHeight.decodePreview()).toThrow(
      'Native RAW image returned invalid height.',
    )
  })

  it('throws when decoded image data length does not match RGB dimensions', () => {
    const processor = createProcessor({
      image: {
        data: new Uint16Array([1, 2, 3, 4, 5]),
        width: 1,
        height: 2,
      },
    })

    expect(() => processor.decodePreview()).toThrow(TypeError)
    expect(() => processor.decodePreview()).toThrow(
      'Native RAW image data length does not match RGB dimensions.',
    )
  })

  it('normalizes valid thumbnail and image objects', () => {
    const thumbnailData = new Uint8Array([9, 8, 7])
    const imageData = new Uint16Array([1, 2, 3, 4, 5, 6])
    const processor = createProcessor({
      thumbnail: {
        data: thumbnailData,
        width: 3,
        height: 2,
        format: 'jpeg',
      },
      image: {
        data: imageData,
        width: 2,
        height: 1,
      },
    })

    expect(processor.extractThumbnail()).toEqual({
      data: thumbnailData,
      width: 3,
      height: 2,
      format: 'jpeg',
    })
    expect(processor.decodeHq()).toEqual({
      data: imageData,
      width: 2,
      height: 1,
      bits: 16,
    })
    processor.openBuffer(new Uint8Array([1]), settings)
    processor.dispose()
  })

  it('preserves undefined open timing returns for runtime fallback timing', () => {
    const processor = createProcessor({ openTimings: undefined })

    expect(processor.openBuffer(new Uint8Array([1]), settings)).toBeUndefined()
  })

  it('normalizes valid open timing objects', () => {
    const processor = createProcessor({
      openTimings: {
        copyToWasm: 7,
        librawOpen: 11,
      },
    })

    expect(processor.openBuffer(new Uint8Array([1]), settings)).toEqual({
      copyToWasm: 7,
      librawOpen: 11,
    })
  })

  it('throws when open timing objects are malformed', () => {
    const negativeTiming = createProcessor({
      openTimings: {
        copyToWasm: -1,
        librawOpen: 11,
      },
    })
    const missingTiming = createProcessor({
      openTimings: {
        copyToWasm: 7,
      },
    })
    const nonObjectTiming = createProcessor({
      openTimings: 12,
    })

    expect(() =>
      negativeTiming.openBuffer(new Uint8Array([1]), settings),
    ).toThrow('Native RAW openBuffer returned invalid copyToWasm timing.')
    expect(() =>
      missingTiming.openBuffer(new Uint8Array([1]), settings),
    ).toThrow('Native RAW openBuffer returned invalid librawOpen timing.')
    expect(() =>
      nonObjectTiming.openBuffer(new Uint8Array([1]), settings),
    ).toThrow('Native RAW openBuffer returned invalid timing data.')
  })
})
