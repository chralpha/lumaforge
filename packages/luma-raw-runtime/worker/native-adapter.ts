import type {
  LumaRawNativeDecodeOptions,
  LumaRawNativeFactory,
  LumaRawNativeOpenSettings,
  LumaRawNativeOpenTimings,
  LumaRawNativeProcessor,
} from './native-types'

type EmbindProcessor = {
  loadBuffer?: (data: Uint8Array) => unknown
  openWithSettings?: (settings: LumaRawNativeOpenSettings) => unknown
  openBuffer: (data: Uint8Array, settings: LumaRawNativeOpenSettings) => unknown
  readMetadata: () => unknown
  extractThumbnail: () => unknown
  decodePreview: (options?: LumaRawNativeDecodeOptions) => unknown
  decodeHq: (options?: LumaRawNativeDecodeOptions) => unknown
  delete?: () => void
}

type EmbindModule = {
  LumaRawProcessor: new () => EmbindProcessor
  HEAPU8?: Uint8Array
}

type NativeThumbnailFormat = 'jpeg' | 'bitmap' | 'unknown'

const maxNativeOutputPixels = 2_147_483_647

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asOpenTiming(value: unknown, label: keyof LumaRawNativeOpenTimings) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(
      `Native RAW openBuffer returned invalid ${label} timing.`,
    )
  }

  return value
}

function asPositiveInteger(value: unknown, label: string) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new TypeError(`Native RAW image returned invalid ${label}.`)
  }

  return value
}

function asOptionalThumbnailDimension(value: unknown, label: string) {
  if (value === null || value === undefined) return undefined
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new TypeError(`Native RAW thumbnail returned invalid ${label}.`)
  }

  return value
}

function isTightTransferableView(data: Uint8Array | Uint16Array) {
  return data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
}

function assertTransferableArrayBuffer(
  data: Uint8Array | Uint16Array,
  label: string,
) {
  if (!(data.buffer instanceof ArrayBuffer)) {
    throw new TypeError(
      `Native RAW ${label} returned data backed by a non-transferable buffer.`,
    )
  }
}

function normalizeUint8Output(data: Uint8Array, label: string) {
  assertTransferableArrayBuffer(data, label)
  return isTightTransferableView(data) ? data : new Uint8Array(data)
}

function normalizeUint16Output(data: Uint16Array, label: string) {
  assertTransferableArrayBuffer(data, label)
  return isTightTransferableView(data) ? data : new Uint16Array(data)
}

function normalizeDecodeOptions(options?: LumaRawNativeDecodeOptions) {
  if (options === null || options === undefined) return undefined

  const { maxOutputPixels } = options
  if (maxOutputPixels === undefined) return undefined
  if (
    typeof maxOutputPixels !== 'number' ||
    !Number.isFinite(maxOutputPixels) ||
    !Number.isInteger(maxOutputPixels) ||
    maxOutputPixels <= 0 ||
    maxOutputPixels > maxNativeOutputPixels
  ) {
    throw new TypeError(
      'Native RAW decode options include invalid maxOutputPixels.',
    )
  }

  return { maxOutputPixels }
}

function normalizeMetadata(value: unknown) {
  const raw = asRecord(value)
  const thumbnailWidth = asNumber(raw.thumbWidth)
  const thumbnailHeight = asNumber(raw.thumbHeight)
  const thumbnailFormat: NativeThumbnailFormat =
    raw.thumbFormat === 'jpeg' || raw.thumbFormat === 'bitmap'
      ? raw.thumbFormat
      : 'unknown'

  return {
    width: asNumber(raw.width),
    height: asNumber(raw.height),
    rawWidth: asNumber(raw.rawWidth),
    rawHeight: asNumber(raw.rawHeight),
    make: typeof raw.make === 'string' ? raw.make : undefined,
    model: typeof raw.model === 'string' ? raw.model : undefined,
    lens: typeof raw.lens === 'string' ? raw.lens : undefined,
    iso: asNumber(raw.iso),
    aperture: asNumber(raw.aperture),
    focalLength: asNumber(raw.focalLength),
    shutter: asNumber(raw.shutter),
    timestamp: asNumber(raw.timestamp),
    orientation: asNumber(raw.orientation),
    blackLevel: asNumber(raw.blackLevel),
    whiteLevel: asNumber(raw.whiteLevel),
    thumbnail:
      thumbnailWidth && thumbnailHeight
        ? {
            width: thumbnailWidth,
            height: thumbnailHeight,
            format: thumbnailFormat,
          }
        : undefined,
  }
}

function normalizeOpenTimings(
  value: unknown,
): LumaRawNativeOpenTimings | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object') {
    throw new TypeError('Native RAW openBuffer returned invalid timing data.')
  }

  const raw = asRecord(value)

  return {
    copyToWasm: asOpenTiming(raw.copyToWasm, 'copyToWasm'),
    librawOpen: asOpenTiming(raw.librawOpen, 'librawOpen'),
  }
}

function normalizeRequiredOpenTimings(value: unknown) {
  const timings = normalizeOpenTimings(value)
  if (!timings) {
    throw new TypeError('Native RAW openBuffer returned invalid timing data.')
  }

  return timings
}

function normalizeLoadBufferTimings(value: unknown) {
  if (value === null || value === undefined || typeof value !== 'object') {
    throw new TypeError('Native RAW openBuffer returned invalid timing data.')
  }

  const raw = asRecord(value)

  return {
    copyToWasm: asOpenTiming(raw.copyToWasm, 'copyToWasm'),
  }
}

function normalizeThumbnail(value: unknown) {
  if (value === null || value === undefined) return undefined

  const raw = asRecord(value)
  if (!(raw.data instanceof Uint8Array)) {
    throw new TypeError('Native RAW thumbnail did not return Uint8Array data.')
  }

  const format: NativeThumbnailFormat =
    raw.format === 'jpeg' || raw.format === 'bitmap' ? raw.format : 'unknown'
  const primaryWidth = asOptionalThumbnailDimension(raw.width, 'width')
  const primaryHeight = asOptionalThumbnailDimension(raw.height, 'height')
  const fallbackWidth = asOptionalThumbnailDimension(
    raw.thumbWidth,
    'thumbWidth',
  )
  const fallbackHeight = asOptionalThumbnailDimension(
    raw.thumbHeight,
    'thumbHeight',
  )
  const width =
    primaryWidth === undefined || primaryWidth === 0
      ? (fallbackWidth ?? 0)
      : primaryWidth
  const height =
    primaryHeight === undefined || primaryHeight === 0
      ? (fallbackHeight ?? 0)
      : primaryHeight

  return {
    data: normalizeUint8Output(raw.data, 'thumbnail'),
    width,
    height,
    format,
  }
}

function normalizeImage(value: unknown) {
  const raw = asRecord(value)
  if (!(raw.data instanceof Uint16Array)) {
    throw new TypeError('Native RAW image did not return Uint16Array data.')
  }

  const width = asPositiveInteger(raw.width, 'width')
  const height = asPositiveInteger(raw.height, 'height')
  const expectedLength = width * height * 3

  if (!Number.isSafeInteger(expectedLength)) {
    throw new TypeError('Native RAW image dimensions are too large.')
  }
  if (raw.data.length !== expectedLength) {
    throw new TypeError(
      'Native RAW image data length does not match RGB dimensions.',
    )
  }

  return {
    data: normalizeUint16Output(raw.data, 'image'),
    width,
    height,
    bits: 16 as const,
  }
}

export function createNativeFactory(
  module: EmbindModule,
): LumaRawNativeFactory {
  return {
    createProcessor(): LumaRawNativeProcessor {
      const processor = new module.LumaRawProcessor()

      return {
        loadBuffer(data) {
          if (!processor.loadBuffer) {
            throw new TypeError(
              'Native RAW openBuffer returned invalid timing data.',
            )
          }
          return normalizeLoadBufferTimings(processor.loadBuffer(data))
        },
        openWithSettings(settings) {
          if (!processor.openWithSettings) {
            throw new TypeError(
              'Native RAW openBuffer returned invalid timing data.',
            )
          }
          return normalizeRequiredOpenTimings(
            processor.openWithSettings(settings),
          )
        },
        openBuffer(data, settings) {
          return normalizeOpenTimings(processor.openBuffer(data, settings))
        },
        readMetadata() {
          return normalizeMetadata(processor.readMetadata())
        },
        extractThumbnail() {
          return normalizeThumbnail(processor.extractThumbnail())
        },
        decodePreview(options) {
          return normalizeImage(
            processor.decodePreview(normalizeDecodeOptions(options)),
          )
        },
        decodeHq(options) {
          return normalizeImage(
            processor.decodeHq(normalizeDecodeOptions(options)),
          )
        },
        dispose() {
          processor.delete?.()
        },
      }
    },
    heapBytes() {
      const heap = (module as unknown as { HEAPU8?: Uint8Array }).HEAPU8
      return heap?.buffer.byteLength ?? 0
    },
  }
}
