import { createNativeFactory } from './native-adapter'
import type { LumaRawNativeFactory } from './native-types'

type NativeModuleFactory = (options?: {
  locateFile?: (path: string) => string
}) => Promise<unknown>

function nativeAssetUrl(fileName: string) {
  const nativeDir = import.meta.url.includes('/assets/')
    ? '../native/'
    : '../dist/native/'

  return new URL(`${nativeDir}${fileName}`, import.meta.url).href
}

export async function loadNativeFactory(): Promise<LumaRawNativeFactory> {
  const moduleUrl = nativeAssetUrl('luma_raw.js')
  const wasmUrl = nativeAssetUrl('luma_raw.wasm')
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
