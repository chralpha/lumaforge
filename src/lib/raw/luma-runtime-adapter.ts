import type {
  LumaEmbeddedPreview,
  LumaRawErrorCode,
  LumaRawFrame,
  LumaRawRuntime,
} from '@lumaforge/luma-raw-runtime'

import type { DecodedImage, ImageMetadata, ProgressCallback } from './decoder'

let singletonRuntime: LumaRawRuntime | null = null
let singletonRuntimePromise: Promise<LumaRawRuntime> | null = null

export class RawAdapterError extends Error {
  readonly code: LumaRawErrorCode

  constructor(code: LumaRawErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RawAdapterError'
    this.code = code
  }
}

async function getRuntime(runtimeFactory?: () => LumaRawRuntime) {
  if (runtimeFactory) {
    return runtimeFactory()
  }

  if (singletonRuntime) {
    return singletonRuntime
  }

  singletonRuntimePromise ??= import('@lumaforge/luma-raw-runtime')
    .then(({ createLumaRawRuntime }) => {
      const runtime =
        singletonRuntime ??
        createLumaRawRuntime({
          requireCrossOriginIsolation: true,
        })

      singletonRuntime = runtime
      return runtime
    })
    .catch((error: unknown) => {
      singletonRuntimePromise = null
      throw error
    })

  return singletonRuntimePromise
}

function getRawErrorCode(error: unknown): LumaRawErrorCode | undefined {
  if (typeof error !== 'object' || !error || !('code' in error)) {
    return undefined
  }

  const code = (error as { code?: unknown }).code
  if (typeof code === 'string' && code.startsWith('RAW_')) {
    return code as LumaRawErrorCode
  }

  return undefined
}

function normalizeRawAdapterError(
  error: unknown,
  fallbackCode: LumaRawErrorCode,
) {
  const code = getRawErrorCode(error) ?? fallbackCode
  const message =
    error instanceof Error ? error.message : 'RAW runtime request failed.'

  return new RawAdapterError(code, message, { cause: error })
}

function formatLumaShutter(shutter?: number) {
  return typeof shutter === 'number' ? `${shutter}s` : undefined
}

export function metadataToImageMetadata(frame: LumaRawFrame): ImageMetadata {
  return {
    make: frame.metadata.make,
    model: frame.metadata.model,
    lens: frame.metadata.lens,
    iso: frame.metadata.iso,
    aperture: frame.metadata.aperture,
    focalLength: frame.metadata.focalLength,
    shutterSpeed: formatLumaShutter(frame.metadata.shutter),
    timestamp:
      typeof frame.metadata.timestamp === 'number'
        ? new Date(frame.metadata.timestamp * 1000)
        : undefined,
    width: frame.metadata.width ?? frame.width,
    height: frame.metadata.height ?? frame.height,
    orientation: frame.metadata.orientation ?? frame.orientation,
  }
}

export function frameToDecodedImage(frame: LumaRawFrame): DecodedImage {
  return {
    width: frame.width,
    height: frame.height,
    channels: 3,
    bitsPerChannel: 16,
    data: frame.data,
    layout: 'rgb-u16',
    colorSpace: 'linear-prophoto-rgb',
    source: frame.source,
    timings: { ...frame.timings },
    metadata: metadataToImageMetadata(frame),
  }
}

export async function extractEmbeddedPreviewWithLuma(
  file: File,
  runtimeFactory?: () => LumaRawRuntime,
): Promise<LumaEmbeddedPreview | null> {
  try {
    const runtime = await getRuntime(runtimeFactory)
    await runtime.init()
    return runtime.extractEmbeddedPreview(file)
  } catch (error) {
    throw normalizeRawAdapterError(error, 'RAW_THUMBNAIL_UNAVAILABLE')
  }
}

export async function decodeQuickRawWithLuma(
  file: File,
  onProgress?: ProgressCallback,
  runtimeFactory?: () => LumaRawRuntime,
): Promise<DecodedImage> {
  try {
    onProgress?.({ phase: 'loading', progress: 0 })

    const runtime = await getRuntime(runtimeFactory)
    await runtime.init()

    onProgress?.({ phase: 'decoding', progress: 50 })

    const frame = await runtime.decodeQuick(file)

    onProgress?.({ phase: 'complete', progress: 100 })

    return frameToDecodedImage(frame)
  } catch (error) {
    throw normalizeRawAdapterError(error, 'RAW_QUICK_DECODE_FAILED')
  }
}

export async function decodeHqRawWithLuma(
  file: File,
  onProgress?: ProgressCallback,
  runtimeFactory?: () => LumaRawRuntime,
): Promise<DecodedImage> {
  try {
    onProgress?.({ phase: 'loading', progress: 0 })

    const runtime = await getRuntime(runtimeFactory)
    await runtime.init()

    onProgress?.({ phase: 'decoding', progress: 50 })

    const frame = await runtime.decodeHq(file)

    onProgress?.({ phase: 'complete', progress: 100 })

    return frameToDecodedImage(frame)
  } catch (error) {
    throw normalizeRawAdapterError(error, 'RAW_HQ_DECODE_FAILED')
  }
}

export function disposeLumaRawRuntime() {
  singletonRuntime?.dispose()
  singletonRuntime = null
  singletonRuntimePromise = null
}

export function toRawAdapterError(error: unknown) {
  const code = getRawErrorCode(error)
  if (code) return code

  if (error instanceof Error) {
    return error.message
  }

  return 'RAW_RUNTIME_UNAVAILABLE'
}
