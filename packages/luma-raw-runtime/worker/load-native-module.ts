import { LumaRawRuntimeError } from '../src/errors'
import { createNativeFactory } from './native-adapter'
import type {
  LumaRawNativeDecodeOptions,
  LumaRawNativeFactory,
} from './native-types'

type NativeModuleFactory = (options?: {
  locateFile?: (path: string) => string
}) => Promise<unknown>

function nativeAssetUrl(fileName: string) {
  const currentUrl = new URL(import.meta.url)
  const pathParts = currentUrl.pathname.split('/').filter(Boolean)
  const inBuiltWorkerAssets =
    pathParts.at(-1)?.startsWith('runtime.worker') &&
    pathParts.at(-2) === 'assets'
  const nativeDir = inBuiltWorkerAssets ? '../native/' : '../dist/native/'

  return new URL(`${nativeDir}${fileName}`, import.meta.url).href
}

function createMissingNativeAssetsError(cause: unknown) {
  return new LumaRawRuntimeError(
    'RAW_RUNTIME_UNAVAILABLE',
    'Luma RAW native assets are missing or unavailable. Run `pnpm --filter @lumaforge/luma-raw-runtime build:native` before using the Luma RAW runtime.',
    { cause },
  )
}

export async function loadNativeFactory(): Promise<LumaRawNativeFactory> {
  const moduleUrl = nativeAssetUrl('luma_raw.js')
  const wasmUrl = nativeAssetUrl('luma_raw.wasm')
  let moduleImport: { default: NativeModuleFactory }

  try {
    moduleImport = (await import(/* @vite-ignore */ moduleUrl)) as {
      default: NativeModuleFactory
    }
  } catch (error) {
    throw createMissingNativeAssetsError(error)
  }

  let module: unknown
  try {
    module = await moduleImport.default({
      locateFile(path) {
        if (path.endsWith('.wasm')) {
          return wasmUrl
        }

        return path
      },
    })
  } catch (error) {
    throw createMissingNativeAssetsError(error)
  }

  return createNativeFactory(
    module as {
      LumaRawProcessor: new () => {
        openBuffer: (data: Uint8Array, settings: unknown) => void
        readMetadata: () => unknown
        extractThumbnail: () => unknown
        decodePreview: (options?: LumaRawNativeDecodeOptions) => unknown
        decodeHq: (options?: LumaRawNativeDecodeOptions) => unknown
        delete?: () => void
      }
    },
  )
}
