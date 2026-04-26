import type {
  LumaEmbeddedPreview,
  LumaRawExportCapability,
  LumaRawRuntime,
} from '@lumaforge/luma-raw-runtime'

import type { DecodedImage, ProgressCallback } from './decoder'
import {
  decodeHqRawWithLuma,
  decodeQuickRawWithLuma,
  extractEmbeddedPreviewWithLuma,
  openRawSessionWithLuma,
} from './luma-runtime-adapter'

export type RawRuntimeSession = {
  extractEmbeddedPreview: (
    signal?: AbortSignal,
  ) => Promise<LumaEmbeddedPreview | null>
  probeExportCapability?: (
    signal?: AbortSignal,
  ) => Promise<LumaRawExportCapability>
  decodeQuickRaw: (
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ) => Promise<DecodedImage>
  decodeHqRaw: (
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ) => Promise<DecodedImage>
  dispose: () => void
}

export type RawRuntimeAdapter = {
  openSession: (file: File, signal?: AbortSignal) => Promise<RawRuntimeSession>
  extractEmbeddedPreview: (file: File) => Promise<LumaEmbeddedPreview | null>
  decodeQuickRaw: (
    file: File,
    onProgress?: ProgressCallback,
  ) => Promise<DecodedImage>
  decodeHqRaw: (
    file: File,
    onProgress?: ProgressCallback,
  ) => Promise<DecodedImage>
}

export function createRawRuntimeAdapter({
  lumaRuntimeFactory,
}: {
  lumaRuntimeFactory?: () => LumaRawRuntime
} = {}): RawRuntimeAdapter {
  return {
    openSession(file, signal) {
      return openRawSessionWithLuma(file, lumaRuntimeFactory, signal)
    },
    extractEmbeddedPreview(file) {
      return extractEmbeddedPreviewWithLuma(file, lumaRuntimeFactory)
    },
    decodeQuickRaw(file, onProgress) {
      return decodeQuickRawWithLuma(file, onProgress, lumaRuntimeFactory)
    },
    decodeHqRaw(file, onProgress) {
      return decodeHqRawWithLuma(file, onProgress, lumaRuntimeFactory)
    },
  }
}

export const rawRuntimeAdapter = createRawRuntimeAdapter()
