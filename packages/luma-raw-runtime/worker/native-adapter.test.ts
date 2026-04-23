import { describe, expect, it } from 'vitest'

import { createNativeFactory } from './native-adapter'
import type {
  LumaRawNativeDecodeOptions,
  LumaRawNativeOpenSettings,
} from './native-types'

type ProcessorValues = {
  openTimings?: unknown
  thumbnail?: unknown
  image?: unknown
  onDecodePreview?: (options?: LumaRawNativeDecodeOptions) => void
  onDecodeHq?: (options?: LumaRawNativeDecodeOptions) => void
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
      loadBuffer(_data: Uint8Array) {
        return { copyToWasm: 0 }
      }
      openWithSettings(_settings: LumaRawNativeOpenSettings) {
        return {
          copyToWasm: 0,
          librawOpen: 0,
        }
      }
      openBuffer(_data: Uint8Array, _settings: LumaRawNativeOpenSettings) {
        return values.openTimings
      }
      readMetadata() {
        return {}
      }
      extractThumbnail() {
        return values.thumbnail
      }
      decodePreview(options?: LumaRawNativeDecodeOptions) {
        values.onDecodePreview?.(options)
        return image
      }
      decodeHq(options?: LumaRawNativeDecodeOptions) {
        values.onDecodeHq?.(options)
        return image
      }
      delete() {}
    },
  }).createProcessor()
}

describe('native-adapter', () => {
  it('reports wasm heap byte length', () => {
    const factory = createNativeFactory({
      HEAPU8: new Uint8Array(new ArrayBuffer(64)),
      LumaRawProcessor: class {
        loadBuffer() {
          return { copyToWasm: 0 }
        }
        openWithSettings() {
          return { copyToWasm: 0, librawOpen: 0 }
        }
        openBuffer() {
          return { copyToWasm: 0, librawOpen: 0 }
        }
        readMetadata() {
          return {}
        }
        extractThumbnail() {
          return undefined
        }
        decodePreview() {
          return { data: new Uint16Array([1, 2, 3]), width: 1, height: 1 }
        }
        decodeHq() {
          return { data: new Uint16Array([1, 2, 3]), width: 1, height: 1 }
        }
        delete() {}
      },
    })

    expect(factory.heapBytes?.()).toBe(64)
  })

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

  it('normalizes JPEG thumbnail dimensions from metadata fallback fields', () => {
    const module = {
      LumaRawProcessor: class {
        openBuffer() {
          return { copyToWasm: 1, librawOpen: 2 }
        }
        loadBuffer() {
          return { copyToWasm: 1 }
        }
        openWithSettings() {
          return { copyToWasm: 0, librawOpen: 2 }
        }
        readMetadata() {
          return {}
        }
        extractThumbnail() {
          return {
            data: new Uint8Array([1, 2, 3]),
            width: 0,
            height: 0,
            thumbWidth: 1616,
            thumbHeight: 1080,
            format: 'jpeg',
          }
        }
        decodePreview() {
          return { data: new Uint16Array([1, 2, 3]), width: 1, height: 1 }
        }
        decodeHq() {
          return { data: new Uint16Array([1, 2, 3]), width: 1, height: 1 }
        }
      },
    }

    const processor = createNativeFactory(module).createProcessor()
    expect(processor.extractThumbnail()).toMatchObject({
      width: 1616,
      height: 1080,
      format: 'jpeg',
    })
  })

  it('throws when thumbnail dimensions are invalid', () => {
    const negativeWidth = createProcessor({
      thumbnail: {
        data: new Uint8Array([1, 2, 3]),
        width: -1,
        height: 1,
        thumbWidth: 1616,
        format: 'jpeg',
      },
    })
    const fractionalFallbackHeight = createProcessor({
      thumbnail: {
        data: new Uint8Array([1, 2, 3]),
        width: 1,
        height: 0,
        thumbHeight: 1080.5,
        format: 'jpeg',
      },
    })

    expect(() => negativeWidth.extractThumbnail()).toThrow(
      'Native RAW thumbnail returned invalid width.',
    )
    expect(() => fractionalFallbackHeight.extractThumbnail()).toThrow(
      'Native RAW thumbnail returned invalid thumbHeight.',
    )
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
    expect(processor.extractThumbnail()?.data).toBe(thumbnailData)
    expect(processor.decodeHq()).toEqual({
      data: imageData,
      width: 2,
      height: 1,
      bits: 16,
    })
    expect(processor.decodePreview().data).toBe(imageData)
    processor.openBuffer(new Uint8Array([1]), settings)
    processor.dispose()
  })

  it('normalizes non-tight thumbnail and image output buffers to owned arrays', () => {
    const thumbnailData = new Uint8Array([8, 9, 1, 2, 3, 7]).subarray(2, 5)
    const imageData = new Uint16Array([8, 9, 1, 2, 3, 7]).subarray(2, 5)
    const processor = createProcessor({
      thumbnail: {
        data: thumbnailData,
        width: 3,
        height: 1,
        format: 'jpeg',
      },
      image: {
        data: imageData,
        width: 1,
        height: 1,
      },
    })

    const thumbnail = processor.extractThumbnail()
    const image = processor.decodePreview()

    expect(thumbnail?.data).toEqual(new Uint8Array([1, 2, 3]))
    expect(thumbnail?.data).not.toBe(thumbnailData)
    expect(thumbnail?.data.buffer).not.toBe(thumbnailData.buffer)
    expect(thumbnail?.data.byteOffset).toBe(0)
    expect(thumbnail?.data.byteLength).toBe(thumbnail?.data.buffer.byteLength)

    expect(image.data).toEqual(new Uint16Array([1, 2, 3]))
    expect(image.data).not.toBe(imageData)
    expect(image.data.buffer).not.toBe(imageData.buffer)
    expect(image.data.byteOffset).toBe(0)
    expect(image.data.byteLength).toBe(image.data.buffer.byteLength)
  })

  it('throws when native output buffers are not transferable ArrayBuffers', () => {
    const thumbnailBuffer = new SharedArrayBuffer(3)
    const imageBuffer = new SharedArrayBuffer(6)
    const thumbnail = createProcessor({
      thumbnail: {
        data: new Uint8Array(thumbnailBuffer),
        width: 3,
        height: 1,
        format: 'jpeg',
      },
    })
    const image = createProcessor({
      image: {
        data: new Uint16Array(imageBuffer),
        width: 1,
        height: 1,
      },
    })

    expect(() => thumbnail.extractThumbnail()).toThrow(
      'Native RAW thumbnail returned data backed by a non-transferable buffer.',
    )
    expect(() => image.decodePreview()).toThrow(
      'Native RAW image returned data backed by a non-transferable buffer.',
    )
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

  it('passes decode options to the native processor', () => {
    const options = { maxOutputPixels: 123 }
    let receivedPreviewOptions: LumaRawNativeDecodeOptions | undefined
    let receivedHqOptions: LumaRawNativeDecodeOptions | undefined
    const processor = createProcessor({
      onDecodePreview(nextOptions) {
        receivedPreviewOptions = nextOptions
      },
      onDecodeHq(nextOptions) {
        receivedHqOptions = nextOptions
      },
    })

    expect(processor.decodePreview(options)).toEqual({
      data: new Uint16Array([1, 2, 3]),
      width: 1,
      height: 1,
      bits: 16,
    })
    expect(processor.decodeHq(options)).toEqual({
      data: new Uint16Array([1, 2, 3]),
      width: 1,
      height: 1,
      bits: 16,
    })
    expect(receivedPreviewOptions).toEqual(options)
    expect(receivedPreviewOptions).not.toBe(options)
    expect(receivedHqOptions).toEqual(options)
    expect(receivedHqOptions).not.toBe(options)
  })

  it('omits absent decode maxOutputPixels for uncapped native calls', () => {
    const receivedOptions: Array<LumaRawNativeDecodeOptions | undefined> = []
    const processor = createProcessor({
      onDecodePreview(nextOptions) {
        receivedOptions.push(nextOptions)
      },
      onDecodeHq(nextOptions) {
        receivedOptions.push(nextOptions)
      },
    })

    processor.decodePreview()
    processor.decodePreview({})
    processor.decodeHq({})

    expect(receivedOptions).toEqual([undefined, undefined, undefined])
  })

  it('rejects invalid decode maxOutputPixels before native calls', () => {
    let nativeCallCount = 0
    const processor = createProcessor({
      onDecodePreview() {
        nativeCallCount += 1
      },
      onDecodeHq() {
        nativeCallCount += 1
      },
    })
    const invalidValues = [0, -1, Number.NaN, 1.5, 2_147_483_648]

    for (const maxOutputPixels of invalidValues) {
      expect(() =>
        processor.decodePreview({
          maxOutputPixels,
        } as LumaRawNativeDecodeOptions),
      ).toThrow('Native RAW decode options include invalid maxOutputPixels.')
      expect(() =>
        processor.decodeHq({
          maxOutputPixels,
        } as LumaRawNativeDecodeOptions),
      ).toThrow('Native RAW decode options include invalid maxOutputPixels.')
    }

    expect(nativeCallCount).toBe(0)
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
