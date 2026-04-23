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
  openRawSessionWithLuma,
} from './luma-runtime-adapter'

export type RawRuntimeKind = 'libraw-wasm' | 'luma'

export type RawRuntimeSession = {
  extractEmbeddedPreview: () => Promise<LumaEmbeddedPreview | null>
  decodeQuickRaw: (onProgress?: ProgressCallback) => Promise<DecodedImage>
  decodeHqRaw: (onProgress?: ProgressCallback) => Promise<DecodedImage>
  dispose: () => void
}

export type RawRuntimeAdapter = {
  openSession: (file: File) => Promise<RawRuntimeSession>
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
      openSession(file) {
        return openRawSessionWithLuma(file, lumaRuntimeFactory)
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

  return {
    openSession(file) {
      return Promise.resolve({
        extractEmbeddedPreview() {
          return Promise.resolve(null)
        },
        decodeQuickRaw(onProgress) {
          return decodeQuickRawLegacy(file, onProgress)
        },
        decodeHqRaw(onProgress) {
          return decodeHqRawLegacy(file, onProgress)
        },
        dispose() {},
      })
    },
    extractEmbeddedPreview() {
      return Promise.resolve(null)
    },
    decodeQuickRaw: decodeQuickRawLegacy,
    decodeHqRaw: decodeHqRawLegacy,
  }
}

export const rawRuntimeAdapter = createRawRuntimeAdapter()
