/// <reference types="node" />

import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { RawRenderExposure } from '@lumaforge/luma-color-runtime'
import { resolveExportColorGraph } from '@lumaforge/luma-color-runtime'
import { createLumaRawRuntime } from '@lumaforge/luma-raw-runtime'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  applyLUTContractSelection,
  parseCubeLUT,
  toLUTData,
} from '~/lib/lut/cube-parser'

import { createLumaJpegRuntime } from '../../../packages/luma-jpeg-runtime/src/runtime'
import { createBaselineJpegEncoder } from '../../../packages/luma-jpeg-runtime/worker/baseline-encoder'
import type {
  JpegWorkerRequest,
  JpegWorkerResponse,
} from '../../../packages/luma-jpeg-runtime/worker/runtime-core'
import { createJpegRuntimeCore } from '../../../packages/luma-jpeg-runtime/worker/runtime-core'
import type { LumaRawErrorCode } from '../../../packages/luma-raw-runtime/src/errors'
import { normalizeRawRuntimeError } from '../../../packages/luma-raw-runtime/src/errors'
import type {
  LumaRawWorkerRequest,
  LumaRawWorkerResponse,
} from '../../../packages/luma-raw-runtime/src/worker-protocol'
import { createNativeFactory } from '../../../packages/luma-raw-runtime/worker/native-adapter'
import type {
  LumaRawNativeDecodeOptions,
  LumaRawNativeFactory,
} from '../../../packages/luma-raw-runtime/worker/native-types'
import { createRuntimeCore } from '../../../packages/luma-raw-runtime/worker/runtime-core'
import { runFullResolutionJpegExport } from './full-res-export'
import { createWasmJpegRowSink } from './jpeg/wasm-row-sink'

type NativeModuleFactory = (options?: {
  locateFile?: (path: string) => string
}) => Promise<unknown>
type JpegWorkerErrorResponse = {
  id: string
  ok: false
  type: JpegWorkerRequest['type']
  error: { message: string }
}
type JpegWorkerMessage = JpegWorkerResponse | JpegWorkerErrorResponse

const JPEG_SOI_MARKER = 65_496
const JPEG_EOI_MARKER = 65_497
const JPEG_MARKER_PREFIX = 255
const JPEG_SOS_MARKER = 218
const JPEG_SOF0_MARKER = 192
const packageDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/luma-raw-runtime',
)
const nativeJsPath = join(packageDir, 'dist', 'native', 'luma_raw.js')
const nativeWasmPath = join(packageDir, 'dist', 'native', 'luma_raw.wasm')
const gfxRawPath =
  '/workspaces/LumaForge/test-images/Fujifilm - GFX100RF - 16bit lossless compressed (4_3).RAF'
const vLogLutPath =
  '/workspaces/LumaForge/V-Log-Alchemy/Luts/Arri/ARRI_LogC2Video_Classic709_VLog.cube'
const hasRealFixture =
  existsSync(nativeJsPath) &&
  existsSync(nativeWasmPath) &&
  existsSync(gfxRawPath) &&
  existsSync(vLogLutPath)

async function requireFile(absolutePath: string, label: string) {
  const entry = await stat(absolutePath)
  if (!entry.isFile()) {
    throw new Error(`Expected ${label} to be a file: ${absolutePath}`)
  }
}

function markCrossOriginIsolated() {
  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    configurable: true,
    value: true,
  })
}

function installFileUrlFetchFallback() {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url

    if (url.startsWith('file:')) {
      const bytes = await readFile(fileURLToPath(url))
      return new Response(new Uint8Array(bytes), {
        status: 200,
        statusText: 'OK',
      })
    }

    return originalFetch(input, init)
  }) as typeof fetch

  return () => {
    globalThis.fetch = originalFetch
  }
}

async function loadNativeFactory(): Promise<LumaRawNativeFactory> {
  const moduleImport = (await import(
    /* @vite-ignore */ pathToFileURL(nativeJsPath).href
  )) as {
    default: NativeModuleFactory
  }

  const module = await moduleImport.default({
    locateFile(path) {
      if (path.endsWith('.wasm')) {
        return pathToFileURL(nativeWasmPath).href
      }

      return path
    },
  })

  return createNativeFactory(
    module as {
      LumaRawProcessor: new () => {
        loadBuffer?: (data: Uint8Array) => unknown
        openWithSettings?: (settings: unknown) => unknown
        openBuffer: (data: Uint8Array, settings: unknown) => unknown
        readMetadata: () => unknown
        extractThumbnail: () => unknown
        probeExportCapability?: () => unknown
        readRawWindow?: (rect: unknown) => unknown
        readProcessedWindow?: (request: unknown) => unknown
        decodePreview: (options?: LumaRawNativeDecodeOptions) => unknown
        decodeHq: (options?: LumaRawNativeDecodeOptions) => unknown
        delete?: () => void
      }
      HEAPU8?: Uint8Array
    },
  )
}

async function createNativeCore() {
  const nativeFactory = await loadNativeFactory()
  return createRuntimeCore(nativeFactory)
}

let nativeCorePromise: ReturnType<typeof createNativeCore> | undefined

function getNativeCore() {
  nativeCorePromise ??= createNativeCore()
  return nativeCorePromise
}

function failureResponse(
  request: LumaRawWorkerRequest,
  error: unknown,
  fallbackCode: LumaRawErrorCode,
): LumaRawWorkerResponse {
  const runtimeError = normalizeRawRuntimeError(error, fallbackCode)

  return {
    id: request.id,
    ok: false,
    type: request.type,
    error: {
      code: runtimeError.code,
      message: runtimeError.message,
    },
  } as LumaRawWorkerResponse
}

class RealNativeWorker {
  onmessage: ((event: MessageEvent<LumaRawWorkerResponse>) => void) | null =
    null
  onerror: ((event: ErrorEvent) => void) | null = null
  private terminated = false

  postMessage(request: LumaRawWorkerRequest) {
    queueMicrotask(() => {
      void this.handleRequest(request)
    })
  }

  terminate() {
    this.terminated = true
  }

  private async handleRequest(request: LumaRawWorkerRequest) {
    if (this.terminated) return

    let response: LumaRawWorkerResponse
    try {
      const core = await getNativeCore()
      response = await core.handleRequest(request)
    } catch (error) {
      response = failureResponse(request, error, 'RAW_RUNTIME_UNAVAILABLE')
    }

    if (this.terminated) return

    this.onmessage?.({
      data: response,
    } as MessageEvent<LumaRawWorkerResponse>)
  }
}

class CoreBackedJpegWorker {
  onmessage: ((event: MessageEvent<JpegWorkerMessage>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  private readonly core = createJpegRuntimeCore(
    async () => createBaselineJpegEncoder,
  )

  postMessage(request: JpegWorkerRequest) {
    void this.core
      .handleRequest(request)
      .then((response) => {
        queueMicrotask(() => {
          this.onmessage?.({
            data: response,
          } as MessageEvent<JpegWorkerMessage>)
        })
      })
      .catch((error) => {
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: false,
              type: request.type,
              error: {
                message: error instanceof Error ? error.message : String(error),
              },
            },
          } as MessageEvent<JpegWorkerMessage>)
        })
      })
  }

  terminate() {}
}

async function createFileFromPath(absolutePath: string) {
  const bytes = await readFile(absolutePath)
  return new File([new Uint8Array(bytes)], basename(absolutePath), {
    type: 'image/x-raw',
  })
}

function createResolvedVLogClassic709Graph(lutContent: string) {
  const parsedLut = parseCubeLUT(lutContent, {
    sourceName: basename(vLogLutPath),
  })
  const lut = applyLUTContractSelection(parsedLut, {
    role: 'combined-look-output',
    inputProfile: 'panasonic-vgamut-vlog',
    outputGamut: 'srgb-rec709',
    outputTransfer: 'bt709',
    outputRange: 'full',
  })
  if (!lut) {
    throw new Error('Expected V-Log Classic709 LUT contract selection')
  }

  const rawRenderExposure: RawRenderExposure = {
    ev: 0.75,
    multiplier: Math.pow(2, 0.75),
    source: 'image-statistics',
  }
  const graph = resolveExportColorGraph({
    styleKind: 'custom',
    intensity: 1,
    builtinPreset: null,
    lut: toLUTData(lut),
    rawRenderExposure,
  })

  if (!graph.supported) {
    throw new Error(graph.message)
  }

  const rawExposureSteps = graph.steps.filter(
    (step) => step.kind === 'raw-render-exposure',
  )

  expect(graph.steps.map((step) => step.kind)).toEqual([
    'input-linear-prophoto',
    'raw-render-exposure',
    'gamut-to-lut-input',
    'encode-lut-transfer',
    'lut3d',
    'lut-output-to-srgb',
    'output-srgb',
  ])
  expect(rawExposureSteps).toEqual([
    {
      kind: 'raw-render-exposure',
      ev: rawRenderExposure.ev,
      multiplier: rawRenderExposure.multiplier,
    },
  ])
  expect(graph.lutProfile).toMatchObject({
    role: 'combined-look-output',
    inputGamut: 'v-gamut',
    inputTransfer: 'v-log',
    outputGamut: 'srgb-rec709',
    outputTransfer: 'bt709',
  })
  expect(graph.steps).toContainEqual(
    expect.objectContaining({
      kind: 'lut-output-to-srgb',
      transfer: 'bt709',
      role: 'combined-look-output',
    }),
  )

  return graph
}

function createRealJpegSink() {
  return createWasmJpegRowSink(() =>
    createLumaJpegRuntime({
      workerFactory: () => new CoreBackedJpegWorker() as unknown as Worker,
    }),
  )
}

async function readBlobBytes(blob: Blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

function readWord(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

async function expectBaselineJpeg(
  blob: Blob,
  dimensions: { width: number; height: number },
) {
  const bytes = new Uint8Array(await readBlobBytes(blob))
  let sof0: { width: number; height: number } | undefined
  let offset = 2

  expect(readWord(bytes, 0)).toBe(JPEG_SOI_MARKER)
  expect(readWord(bytes, bytes.length - 2)).toBe(JPEG_EOI_MARKER)

  while (offset < bytes.length - 2) {
    if (bytes[offset] !== JPEG_MARKER_PREFIX) {
      offset += 1
      continue
    }

    const marker = bytes[offset + 1]
    if (marker === JPEG_SOS_MARKER) {
      break
    }

    const segmentLength = readWord(bytes, offset + 2)
    if (marker === JPEG_SOF0_MARKER) {
      sof0 = {
        height: readWord(bytes, offset + 5),
        width: readWord(bytes, offset + 7),
      }
    }
    offset += 2 + segmentLength
  }

  expect(sof0).toEqual(dimensions)
}

describe('full-resolution export real RAW fixtures', () => {
  let restoreFetch: (() => void) | undefined

  beforeAll(async () => {
    if (!hasRealFixture) return

    await Promise.all([
      requireFile(nativeJsPath, 'native runtime JS artifact'),
      requireFile(nativeWasmPath, 'native runtime WASM artifact'),
      requireFile(gfxRawPath, 'GFX100RF RAF fixture'),
      requireFile(vLogLutPath, 'V-Log Classic709 LUT fixture'),
    ])
    markCrossOriginIsolated()
    restoreFetch = installFileUrlFetchFallback()
  })

  afterAll(() => {
    restoreFetch?.()
  })

  it.skipIf(!hasRealFixture)(
    'exports the GFX100RF RAF through the real processed-window path with the V-Log Classic709 LUT',
    async () => {
      const graph = createResolvedVLogClassic709Graph(
        await readFile(vLogLutPath, 'utf8'),
      )
      const runtime = createLumaRawRuntime({
        workerFactory: () => new RealNativeWorker() as unknown as Worker,
      })
      const progress: number[] = []
      let finalWrittenRows = 0

      try {
        await runtime.init()
        const session = await runtime.openSession(
          await createFileFromPath(gfxRawPath),
          { maxOutputPixels: 2_500_000 },
        )

        try {
          const capability = await session.probeExportCapability()
          expect(capability.supported, JSON.stringify(capability)).toBe(true)
          expect(capability.strategy).toBe('libraw-processed-window')
          expect(capability.width).toBeGreaterThan(10_000)
          expect(capability.height).toBeGreaterThan(8_000)

          const blob = await runFullResolutionJpegExport({
            capability,
            graph,
            preferredRows: 512,
            quality: 0.92,
            readProcessedWindow: session.readProcessedWindow,
            onProgress(entry) {
              progress.push(entry.progress)
            },
            writerFactory: () => {
              let writtenRows = 0

              return {
                async writeRows(rows, rowCount) {
                  expect(rows).toBeInstanceOf(Uint8Array)
                  expect(rows.length).toBe(capability.width * rowCount * 3)
                  writtenRows += rowCount
                },
                async close() {
                  expect(writtenRows).toBe(capability.height)
                  finalWrittenRows = writtenRows
                  return new Blob([new Uint8Array([1])], {
                    type: 'image/jpeg',
                  })
                },
                async abort() {
                  return undefined
                },
              }
            },
          })

          expect(blob.type).toBe('image/jpeg')
          expect(finalWrittenRows).toBe(capability.height)
          expect(progress.at(-1)).toBe(100)
        } finally {
          session.dispose()
        }
      } finally {
        runtime.dispose()
      }
    },
    900_000,
  )

  it.skipIf(!hasRealFixture)(
    'encodes a representative GFX100RF RAF export region through the real JPEG row sink',
    async () => {
      const graph = createResolvedVLogClassic709Graph(
        await readFile(vLogLutPath, 'utf8'),
      )
      const runtime = createLumaRawRuntime({
        workerFactory: () => new RealNativeWorker() as unknown as Worker,
      })

      try {
        await runtime.init()
        const session = await runtime.openSession(
          await createFileFromPath(gfxRawPath),
          { maxOutputPixels: 2_500_000 },
        )

        try {
          const capability = await session.probeExportCapability()
          expect(capability.supported, JSON.stringify(capability)).toBe(true)

          const jpegWidth = 1024
          const jpegHeight = 512
          const blob = await runFullResolutionJpegExport({
            capability: {
              ...capability,
              width: jpegWidth,
              height: jpegHeight,
            },
            graph,
            preferredRows: 256,
            quality: 0.92,
            readProcessedWindow: session.readProcessedWindow,
            jpegSink: createRealJpegSink(),
          })

          expect(blob.type).toBe('image/jpeg')
          expect(blob.size).toBeGreaterThan(0)
          await expectBaselineJpeg(blob, {
            width: jpegWidth,
            height: jpegHeight,
          })
        } finally {
          session.dispose()
        }
      } finally {
        runtime.dispose()
      }
    },
    120_000,
  )
})
