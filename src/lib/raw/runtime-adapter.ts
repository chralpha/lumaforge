import type {
  LumaEmbeddedPreview,
  LumaRawRuntime,
} from '@lumaforge/luma-raw-runtime'

import type { DecodedImage, ProgressCallback } from './decoder'
import {
  decodeHqRaw as decodeHqRawLegacy,
  decodeQuickRaw as decodeQuickRawLegacy,
} from './decoder'
import {
  decodeHqRawWithLuma,
  decodeQuickRawWithLuma,
  extractEmbeddedPreviewWithLuma,
} from './luma-runtime-adapter'

export type RawRuntimeKind = 'libraw-wasm' | 'luma'

export type RawRuntimeAdapter = {
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

export function runtimeKindFromEnv(): RawRuntimeKind {
  return import.meta.env.VITE_RAW_RUNTIME === 'luma' ? 'luma' : 'libraw-wasm'
}

export function createRawRuntimeAdapter({
  runtimeKind = runtimeKindFromEnv(),
  lumaRuntimeFactory,
}: {
  runtimeKind?: RawRuntimeKind
  lumaRuntimeFactory?: () => LumaRawRuntime
} = {}): RawRuntimeAdapter {
  if (runtimeKind === 'luma') {
    return {
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

  return {
    extractEmbeddedPreview() {
      return Promise.resolve(null)
    },
    decodeQuickRaw: decodeQuickRawLegacy,
    decodeHqRaw: decodeHqRawLegacy,
  }
}

export const rawRuntimeAdapter = createRawRuntimeAdapter()
