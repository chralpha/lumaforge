import { resolveRawRenderExposure } from '@lumaforge/luma-color-runtime'
import type {
  LumaEmbeddedPreview,
  LumaRawErrorCode,
  LumaRawExportCapability,
  LumaRawExportUnsupportedReason,
  LumaRawFrame,
  LumaRawRuntime,
} from '@lumaforge/luma-raw-runtime'

import { JPEG_RUNTIME_UNAVAILABLE_MESSAGE } from '~/lib/export/jpeg/wasm-row-sink'

import type { DecodedImage, ImageMetadata, ProgressCallback } from './decoder'
import { QUICK_PREVIEW_MAX_PIXELS } from './decoder'
import type {
  JpegRuntimeAvailabilityProbe,
  RawRuntimeSession,
} from './runtime-adapter'

let singletonRuntime: LumaRawRuntime | null = null
let singletonRuntimePromise: Promise<LumaRawRuntime> | null = null

type RawAdapterErrorCode = LumaRawErrorCode | 'RAW_BOUNDED_HQ_DECODE_FAILED'

export class RawAdapterError extends Error {
  readonly code: RawAdapterErrorCode

  constructor(
    code: RawAdapterErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
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

function getRawErrorCode(error: unknown): RawAdapterErrorCode | undefined {
  if (typeof error !== 'object' || !error || !('code' in error)) {
    return undefined
  }

  const code = (error as { code?: unknown }).code
  if (typeof code === 'string' && code.startsWith('RAW_')) {
    return code as RawAdapterErrorCode
  }

  return undefined
}

function normalizeRawAdapterError(
  error: unknown,
  fallbackCode: RawAdapterErrorCode,
) {
  const code = getRawErrorCode(error) ?? fallbackCode
  const message =
    error instanceof Error ? error.message : 'RAW runtime request failed.'

  return new RawAdapterError(code, message, { cause: error })
}

function formatLumaShutter(shutter?: number) {
  return typeof shutter === 'number' ? `${shutter}s` : undefined
}

function getUnsupportedExportFactReasons(capability: LumaRawExportCapability) {
  const reasons: LumaRawExportUnsupportedReason[] = []

  if (
    capability.strategy !== 'libraw-processed-window' ||
    capability.windows.librawProcessed !== true
  ) {
    reasons.push('processed-window-unavailable')
  }

  const color = capability.color
  const hasRuntimeColorProcessingFacts =
    color !== undefined &&
    'cameraWhiteBalanceAppliedByRuntime' in color &&
    'cameraMatrixAppliedByRuntime' in color

  if (
    !hasRuntimeColorProcessingFacts ||
    color.workingSpace !== 'linear-prophoto-rgb' ||
    color.cameraWhiteBalanceAppliedByRuntime !== true ||
    color.cameraMatrixAppliedByRuntime !== true
  ) {
    reasons.push('missing-color-transform')
  }

  return reasons
}

function createJpegRuntimeUnavailableProbeError(cause?: unknown) {
  return new Error(JPEG_RUNTIME_UNAVAILABLE_MESSAGE, { cause })
}

async function assertJpegRuntimeAvailable(
  probe?: JpegRuntimeAvailabilityProbe,
) {
  if (!probe) {
    return
  }

  try {
    if (await probe()) {
      return
    }
  } catch (error) {
    throw createJpegRuntimeUnavailableProbeError(error)
  }

  throw createJpegRuntimeUnavailableProbeError(
    new Error('JPEG runtime readiness probe returned unavailable.'),
  )
}

async function resolveExportCapability(
  rawCapability: LumaRawExportCapability,
  jpegRuntimeAvailabilityProbe?: JpegRuntimeAvailabilityProbe,
): Promise<LumaRawExportCapability> {
  if (!rawCapability.supported) {
    return rawCapability
  }

  const unsupportedFactReasons = getUnsupportedExportFactReasons(rawCapability)
  if (unsupportedFactReasons.length > 0) {
    return {
      ...rawCapability,
      supported: false,
      reasons: unsupportedFactReasons,
    }
  }

  await assertJpegRuntimeAvailable(jpegRuntimeAvailabilityProbe)

  return rawCapability
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
    baselineExposure: frame.metadata.baselineExposure,
  }
}

export function frameToDecodedImage(frame: LumaRawFrame): DecodedImage {
  const metadata = metadataToImageMetadata(frame)

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
    metadata,
    renderExposure: resolveRawRenderExposure({
      metadata,
      image: {
        data: frame.data,
        width: frame.width,
        height: frame.height,
      },
    }),
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

export async function decodeBoundedHqRawWithLuma(
  file: File,
  options: { maxOutputPixels: number },
  onProgress?: ProgressCallback,
  runtimeFactory?: () => LumaRawRuntime,
): Promise<DecodedImage> {
  try {
    onProgress?.({ phase: 'decoding', progress: 0 })
    const runtime = await getRuntime(runtimeFactory)
    await runtime.init()
    const frame = await runtime.decodeBoundedHq(file, options)
    onProgress?.({ phase: 'complete', progress: 100 })
    return frameToDecodedImage(frame)
  } catch (error) {
    throw normalizeRawAdapterError(error, 'RAW_BOUNDED_HQ_DECODE_FAILED')
  }
}

export async function openRawSessionWithLuma(
  file: File,
  runtimeFactory?: () => LumaRawRuntime,
  signal?: AbortSignal,
  jpegRuntimeAvailabilityProbe?: JpegRuntimeAvailabilityProbe,
): Promise<RawRuntimeSession> {
  let session: Awaited<ReturnType<LumaRawRuntime['openSession']>>
  try {
    const runtime = await getRuntime(runtimeFactory)
    await runtime.init()
    session = await runtime.openSession(
      file,
      {
        maxOutputPixels: QUICK_PREVIEW_MAX_PIXELS,
      },
      signal,
    )
  } catch (error) {
    throw normalizeRawAdapterError(error, 'RAW_OPEN_FAILED')
  }

  return {
    sourceDimensions: {
      width: session.probe.width,
      height: session.probe.height,
    },
    async extractEmbeddedPreview(signal?: AbortSignal) {
      try {
        return await session.extractEmbeddedPreview(signal)
      } catch (error) {
        throw normalizeRawAdapterError(error, 'RAW_THUMBNAIL_UNAVAILABLE')
      }
    },
    async probeExportCapability(
      signal?: AbortSignal,
    ): Promise<LumaRawExportCapability> {
      const rawCapability = await session.probeExportCapability(signal)
      return resolveExportCapability(
        rawCapability,
        jpegRuntimeAvailabilityProbe,
      )
    },
    async decodeQuickRaw(onProgress?: ProgressCallback, signal?: AbortSignal) {
      try {
        onProgress?.({ phase: 'decoding', progress: 50 })
        const frame = await session.decodeQuick(
          {
            maxOutputPixels: QUICK_PREVIEW_MAX_PIXELS,
          },
          signal,
        )
        onProgress?.({ phase: 'complete', progress: 100 })
        return frameToDecodedImage(frame)
      } catch (error) {
        throw normalizeRawAdapterError(error, 'RAW_QUICK_DECODE_FAILED')
      }
    },
    async decodeBoundedHqRaw(
      options: { maxOutputPixels: number },
      onProgress?: ProgressCallback,
      signal?: AbortSignal,
    ) {
      try {
        onProgress?.({ phase: 'decoding', progress: 0 })
        const frame = await session.decodeBoundedHq(options, signal)
        onProgress?.({ phase: 'complete', progress: 100 })
        return frameToDecodedImage(frame)
      } catch (error) {
        throw normalizeRawAdapterError(error, 'RAW_BOUNDED_HQ_DECODE_FAILED')
      }
    },
    dispose() {
      session.dispose()
    },
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
