import type {
  LumaEmbeddedPreview,
  LumaRawFrame,
  LumaRawRuntime,
} from '@lumaforge/luma-raw-runtime'
import {
  createLumaRawRuntime,
  LumaRawRuntimeError,
} from '@lumaforge/luma-raw-runtime'

import type { DecodedImage, ImageMetadata, ProgressCallback } from './decoder'

let singletonRuntime: LumaRawRuntime | null = null

function getRuntime(runtimeFactory?: () => LumaRawRuntime) {
  if (runtimeFactory) {
    return runtimeFactory()
  }

  singletonRuntime ??= createLumaRawRuntime({
    requireCrossOriginIsolation: true,
  })

  return singletonRuntime
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
  const runtime = getRuntime(runtimeFactory)
  await runtime.init()
  return runtime.extractEmbeddedPreview(file)
}

export async function decodeQuickRawWithLuma(
  file: File,
  onProgress?: ProgressCallback,
  runtimeFactory?: () => LumaRawRuntime,
): Promise<DecodedImage> {
  onProgress?.({ phase: 'loading', progress: 0 })

  const runtime = getRuntime(runtimeFactory)
  await runtime.init()

  onProgress?.({ phase: 'decoding', progress: 50 })

  const frame = await runtime.decodeQuick(file)

  onProgress?.({ phase: 'complete', progress: 100 })

  return frameToDecodedImage(frame)
}

export async function decodeHqRawWithLuma(
  file: File,
  onProgress?: ProgressCallback,
  runtimeFactory?: () => LumaRawRuntime,
): Promise<DecodedImage> {
  onProgress?.({ phase: 'loading', progress: 0 })

  const runtime = getRuntime(runtimeFactory)
  await runtime.init()

  onProgress?.({ phase: 'decoding', progress: 50 })

  const frame = await runtime.decodeHq(file)

  onProgress?.({ phase: 'complete', progress: 100 })

  return frameToDecodedImage(frame)
}

export function disposeLumaRawRuntime() {
  singletonRuntime?.dispose()
  singletonRuntime = null
}

export function toRawAdapterError(error: unknown) {
  if (error instanceof LumaRawRuntimeError) {
    return error.code
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'RAW_RUNTIME_UNAVAILABLE'
}
