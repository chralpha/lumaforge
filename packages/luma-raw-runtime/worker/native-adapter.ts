import type {
  LumaRawExportColorFacts,
  LumaRawExportCapability,
  LumaRawExportOrientation,
  LumaRawExportUnsupportedReason,
  LumaRawVisibleCrop,
  LumaRawWindow,
  LumaRawWindowRect,
} from '../src/types'
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
  probeExportCapability?: () => unknown
  readRawWindow?: (rect: LumaRawWindowRect) => unknown
  decodePreview: (options?: LumaRawNativeDecodeOptions) => unknown
  decodeHq: (options?: LumaRawNativeDecodeOptions) => unknown
  delete?: () => void
}

type EmbindModule = {
  LumaRawProcessor: new () => EmbindProcessor
  HEAPU8?: Uint8Array
}

type NativeThumbnailFormat = 'jpeg' | 'bitmap' | 'unknown'
type NativeCfaPattern =
  | 'x-trans'
  | 'rggb'
  | 'bggr'
  | 'grbg'
  | 'gbrg'
  | 'unsupported'

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

function asNonNegativeInteger(value: unknown, label: string) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new TypeError(`Native RAW ${label} returned invalid ${label}.`)
  }

  return value
}

function asFiniteNumber(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Native RAW ${label} returned invalid ${label}.`)
  }

  return value
}

function asFiniteNumberOrUndefined(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asNonNegativeIntegerOrUndefined(value: unknown) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : undefined
}

function asPositiveIntegerOrUndefined(value: unknown) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
    ? value
    : undefined
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

function clampPhase(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(5, Math.trunc(value)))
}

function normalizeCfa(value: unknown) {
  const raw = asRecord(value)
  const pattern: NativeCfaPattern =
    raw.pattern === 'x-trans' ||
    raw.pattern === 'rggb' ||
    raw.pattern === 'bggr' ||
    raw.pattern === 'grbg' ||
    raw.pattern === 'gbrg'
      ? raw.pattern
      : 'unsupported'

  return {
    pattern,
    xPhase: clampPhase(raw.xPhase),
    yPhase: clampPhase(raw.yPhase),
  } as const
}

function normalizeUnsupportedReasons(
  value: unknown,
): LumaRawExportUnsupportedReason[] {
  if (!Array.isArray(value)) return []

  const reasons = value.filter(
    (
      reason,
    ): reason is LumaRawExportUnsupportedReason =>
      reason === 'unsupported-source' ||
      reason === 'unsupported-cfa' ||
      reason === 'compressed-raw-window-unavailable' ||
      reason === 'raw-window-unavailable' ||
      reason === 'missing-dimensions' ||
      reason === 'missing-levels' ||
      reason === 'missing-visible-crop' ||
      reason === 'unsupported-orientation' ||
      reason === 'missing-color-transform' ||
      reason === 'missing-export-facts',
  )

  return [...new Set(reasons)]
}

function normalizeVisibleCrop(
  value: unknown,
  rawWidth: number,
  rawHeight: number,
): LumaRawVisibleCrop | undefined {
  const raw = asRecord(value)
  const x = asNonNegativeIntegerOrUndefined(raw.x)
  const y = asNonNegativeIntegerOrUndefined(raw.y)
  const width = asPositiveIntegerOrUndefined(raw.width)
  const height = asPositiveIntegerOrUndefined(raw.height)

  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return undefined
  }
  if (
    rawWidth <= 0 ||
    rawHeight <= 0 ||
    x + width > rawWidth ||
    y + height > rawHeight
  ) {
    return undefined
  }

  return { x, y, width, height }
}

function normalizeExportOrientation(
  value: unknown,
): LumaRawExportOrientation | undefined {
  if (typeof value === 'number') {
    const code = asPositiveIntegerOrUndefined(value)
    if (code === undefined) return undefined
    return { code, supported: code === 1 }
  }

  const raw = asRecord(value)
  const code = asPositiveIntegerOrUndefined(raw.code)
  if (code === undefined) return undefined

  return {
    code,
    supported: raw.supported === true && code === 1,
  }
}

function normalizeFiniteTuple(value: unknown, length: number) {
  if (!Array.isArray(value) || value.length !== length) return undefined

  const numbers = value.map(asFiniteNumberOrUndefined)
  return numbers.every((number) => number !== undefined)
    ? (numbers as number[])
    : undefined
}

function hasUsableMatrix3x3(values: number[]) {
  const determinant =
    values[0] * (values[4] * values[8] - values[5] * values[7]) -
    values[1] * (values[3] * values[8] - values[5] * values[6]) +
    values[2] * (values[3] * values[7] - values[4] * values[6])

  return Math.abs(determinant) > 1e-12
}

function normalizeExportColorFacts(
  value: unknown,
): LumaRawExportColorFacts | undefined {
  const raw = asRecord(value)
  const whiteBalance = normalizeFiniteTuple(raw.whiteBalance, 4)
  const cameraToWorkingRgb = normalizeFiniteTuple(raw.cameraToWorkingRgb, 9)

  if (
    !whiteBalance ||
    !cameraToWorkingRgb ||
    raw.workingSpace !== 'linear-prophoto-rgb' ||
    whiteBalance.some((value) => value <= 0) ||
    !hasUsableMatrix3x3(cameraToWorkingRgb)
  ) {
    return undefined
  }

  return {
    whiteBalance: whiteBalance as [number, number, number, number],
    cameraToWorkingRgb: cameraToWorkingRgb as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ],
    workingSpace: 'linear-prophoto-rgb',
  }
}

export function normalizeExportCapability(
  value: unknown,
): LumaRawExportCapability {
  const raw = asRecord(value)
  const width = asNonNegativeIntegerOrUndefined(raw.width) ?? 0
  const height = asNonNegativeIntegerOrUndefined(raw.height) ?? 0
  const rawWidth = asNonNegativeIntegerOrUndefined(raw.rawWidth) ?? 0
  const rawHeight = asNonNegativeIntegerOrUndefined(raw.rawHeight) ?? 0
  const visibleCrop = normalizeVisibleCrop(raw.visibleCrop, rawWidth, rawHeight)
  const cfa = normalizeCfa(raw.cfa)
  const blackLevel = asFiniteNumberOrUndefined(raw.blackLevel)
  const whiteLevel = asFiniteNumberOrUndefined(raw.whiteLevel)
  const orientation = normalizeExportOrientation(raw.orientation)
  const color = normalizeExportColorFacts(raw.color)
  const normalizedReasons = normalizeUnsupportedReasons(raw.reasons)
  const reasons = new Set<LumaRawExportUnsupportedReason>(normalizedReasons)
  let supported = raw.supported === true
  let missingFactCount = 0

  if (cfa.pattern === 'unsupported') {
    supported = false
    reasons.add('unsupported-cfa')
  }

  if (
    width <= 0 ||
    height <= 0 ||
    rawWidth <= 0 ||
    rawHeight <= 0
  ) {
    supported = false
    reasons.add('missing-dimensions')
  }

  if (blackLevel === undefined || whiteLevel === undefined) {
    supported = false
    reasons.add('missing-levels')
  }

  if (raw.supported === true) {
    if (!visibleCrop) {
      missingFactCount += 1
      reasons.add('missing-visible-crop')
    }
    if (!orientation?.supported) {
      reasons.add('unsupported-orientation')
    }
    if (!color) {
      missingFactCount += 1
      reasons.add('missing-color-transform')
    }
    if (missingFactCount > 1) {
      reasons.add('missing-export-facts')
    }
  }

  if (reasons.size > 0) {
    supported = false
  }

  const capability: LumaRawExportCapability = {
    supported,
    width,
    height,
    rawWidth,
    rawHeight,
    cfa,
    blackLevel: blackLevel ?? 0,
    whiteLevel: whiteLevel ?? 0,
    reasons: [...reasons],
  }

  if (visibleCrop) capability.visibleCrop = visibleCrop
  if (orientation) capability.orientation = orientation
  if (color) capability.color = color

  return capability
}

function normalizeWindowRect(value: unknown): LumaRawWindowRect {
  const raw = asRecord(value)

  return {
    x: asNonNegativeInteger(raw.x, 'x'),
    y: asNonNegativeInteger(raw.y, 'y'),
    width: asPositiveInteger(raw.width, 'width'),
    height: asPositiveInteger(raw.height, 'height'),
  }
}

function normalizeRawWindow(value: unknown): LumaRawWindow {
  const raw = asRecord(value)
  const rect = normalizeWindowRect(raw.rect)

  if (!(raw.data instanceof Uint16Array)) {
    throw new TypeError('Native RAW raw-window did not return Uint16Array data.')
  }

  const expectedLength = rect.width * rect.height
  if (!Number.isSafeInteger(expectedLength)) {
    throw new TypeError('Native RAW raw-window dimensions are too large.')
  }
  if (raw.data.length !== expectedLength) {
    throw new TypeError(
      'Native RAW raw-window data length does not match rect dimensions.',
    )
  }

  return {
    rect,
    cfa: normalizeCfa(raw.cfa),
    data: normalizeUint16Output(raw.data, 'raw-window'),
    blackLevel: asFiniteNumber(raw.blackLevel, 'blackLevel'),
    whiteLevel: asFiniteNumber(raw.whiteLevel, 'whiteLevel'),
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
        probeExportCapability() {
          if (!processor.probeExportCapability) {
            return {
              supported: false,
              width: 0,
              height: 0,
              rawWidth: 0,
              rawHeight: 0,
              cfa: { pattern: 'unsupported', xPhase: 0, yPhase: 0 },
              blackLevel: 0,
              whiteLevel: 0,
              orientation: { code: 1, supported: true },
              reasons: ['raw-window-unavailable'],
            }
          }

          return normalizeExportCapability(processor.probeExportCapability())
        },
        readRawWindow(rect) {
          if (!processor.readRawWindow) {
            throw new TypeError('Native RAW raw-window access is unavailable.')
          }

          return normalizeRawWindow(processor.readRawWindow(rect))
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
      return heap ? heap.buffer.byteLength : undefined
    },
  }
}
