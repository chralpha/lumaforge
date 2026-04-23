import type {
  LumaRawNativeFactory,
  LumaRawNativeOpenSettings,
  LumaRawNativeProcessor,
} from './native-types'

type EmbindProcessor = {
  openBuffer: (data: Uint8Array, settings: LumaRawNativeOpenSettings) => void
  readMetadata: () => unknown
  extractThumbnail: () => unknown
  decodePreview: () => unknown
  decodeHq: () => unknown
  delete?: () => void
}

type EmbindModule = {
  LumaRawProcessor: new () => EmbindProcessor
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

function normalizeThumbnail(value: unknown) {
  const raw = asRecord(value)
  if (!(raw.data instanceof Uint8Array)) return undefined

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

  return {
    data: raw.data,
    width: asNumber(raw.width) || 0,
    height: asNumber(raw.height) || 0,
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
          processor.openBuffer(data, settings)
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
  }
}
