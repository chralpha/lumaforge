import type { NativeJpegModule } from './native-adapter'
import { createNativeJpegEncoderFactory } from './native-adapter'

type NativeModuleFactory = (options?: {
  locateFile?: (path: string) => string
}) => Promise<unknown>

type NativeModuleImport = { default: NativeModuleFactory }
type NativeModuleImporter = (moduleUrl: string) => Promise<NativeModuleImport>

export function nativeJpegAssetUrl(
  fileName: string,
  importMetaUrl = import.meta.url,
) {
  const currentUrl = new URL(importMetaUrl)
  const pathParts = currentUrl.pathname.split('/').filter(Boolean)
  const inBuiltWorkerAssets =
    pathParts.at(-1)?.startsWith('runtime.worker') &&
    pathParts.at(-2) === 'assets'
  const nativeDir = inBuiltWorkerAssets ? '../native/' : '../dist/native/'

  return new URL(`${nativeDir}${fileName}`, importMetaUrl).href
}

export async function loadNativeJpegEncoderFactoryWithImporter(
  importModule: NativeModuleImporter,
  importMetaUrl = import.meta.url,
) {
  const moduleUrl = nativeJpegAssetUrl('luma_jpeg.js', importMetaUrl)
  const wasmUrl = nativeJpegAssetUrl('luma_jpeg.wasm', importMetaUrl)
  let moduleImport: NativeModuleImport

  try {
    moduleImport = await importModule(moduleUrl)
    const module = await moduleImport.default({
      locateFile(path) {
        return path.endsWith('.wasm') ? wasmUrl : path
      },
    })

    return createNativeJpegEncoderFactory(module as NativeJpegModule)
  } catch (error) {
    throw new Error('JPEG_NATIVE_RUNTIME_UNAVAILABLE', { cause: error })
  }
}

export async function loadNativeJpegEncoderFactory() {
  return loadNativeJpegEncoderFactoryWithImporter(
    (moduleUrl) =>
      import(/* @vite-ignore */ moduleUrl) as Promise<NativeModuleImport>,
  )
}
