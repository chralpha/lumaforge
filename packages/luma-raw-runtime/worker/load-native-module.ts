import { createNativeFactory } from './native-adapter'
import type { LumaRawNativeFactory } from './native-types'

type NativeModuleFactory = (options?: {
  locateFile?: (path: string) => string
}) => Promise<unknown>

export async function loadNativeFactory(): Promise<LumaRawNativeFactory> {
  const moduleUrl = new URL('../dist/native/luma_raw.js', import.meta.url).href
  const wasmUrl = new URL('../dist/native/luma_raw.wasm', import.meta.url).href
  const moduleImport = (await import(/* @vite-ignore */ moduleUrl)) as {
    default: NativeModuleFactory
  }

  const module = await moduleImport.default({
    locateFile(path) {
      if (path.endsWith('.wasm')) {
        return wasmUrl
      }

      return path
    },
  })

  return createNativeFactory(
    module as {
      LumaRawProcessor: new () => {
        openBuffer: (data: Uint8Array, settings: unknown) => void
        readMetadata: () => unknown
        extractThumbnail: () => unknown
        decodePreview: () => unknown
        decodeHq: () => unknown
        delete?: () => void
      }
    },
  )
}
