import type {
  LumaRawNativeFactory,
  LumaRawNativeOpenSettings,
  LumaRawNativeOpenTimings,
  LumaRawNativeProcessor,
} from './native-types'

type EmbindProcessor = {
  openBuffer: (data: Uint8Array, settings: LumaRawNativeOpenSettings) => unknown
  readMetadata: () => unknown
  extractThumbnail: () => unknown
  decodePreview: () => unknown
  decodeHq: () => unknown
  delete?: () => void
}

type EmbindModule = {
  LumaRawProcessor: new () => EmbindProcessor
  HEAPU8?: Uint8Array
}

type NativeThumbnailFormat = 'jpeg' | 'bitmap' | 'unknown'

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

function normalizeThumbnail(value: unknown) {
  if (value === null || value === undefined) return undefined

  const raw = asRecord(value)
  if (!(raw.data instanceof Uint8Array)) {
    throw new TypeError('Native RAW thumbnail did not return Uint8Array data.')
  }

  const format: NativeThumbnailFormat =
    raw.format === 'jpeg' || raw.format === 'bitmap' ? raw.format : 'unknown'

  return {
    data: raw.data,
    width: asNumber(raw.width) || 0,
    height: asNumber(raw.height) || 0,
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
    data: raw.data,
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
        openBuffer(data, settings) {
          return normalizeOpenTimings(processor.openBuffer(data, settings))
        },
        readMetadata() {
          return normalizeMetadata(processor.readMetadata())
        },
        extractThumbnail() {
          return normalizeThumbnail(processor.extractThumbnail())
        },
        decodePreview() {
          return normalizeImage(processor.decodePreview())
        },
        decodeHq() {
          return normalizeImage(processor.decodeHq())
        },
        dispose() {
          processor.delete?.()
        },
      }
    },
    heapBytes() {
      return module.HEAPU8?.buffer.byteLength ?? 0
    },
  }
}
