/// <reference types="node" />

import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createNativeFactory } from '../worker/native-adapter'
import type { LumaRawNativeDecodeOptions } from '../worker/native-types'
import { createRuntimeCore } from '../worker/runtime-core'
import type { LumaRawErrorCode } from './errors'
import { normalizeRawRuntimeError } from './errors'
import { createLumaRawRuntime } from './index'
import type { LumaEmbeddedPreview } from './types'
import type {
  LumaRawWorkerRequest,
  LumaRawWorkerResponse,
} from './worker-protocol'

type NativeModuleFactory = (options?: {
  locateFile?: (path: string) => string
}) => Promise<unknown>

const packageDir = process.cwd()
const nativeJsPath = join(packageDir, 'dist', 'native', 'luma_raw.js')
const nativeWasmPath = join(packageDir, 'dist', 'native', 'luma_raw.wasm')
const publicRawFixturePath = join(
  packageDir,
  'fixtures',
  '.cache',
  'public',
  'raw-pixls-iphone-se.dng',
)
const artifactHint =
  'Run `pnpm --filter @lumaforge/luma-raw-runtime build:native` before `pnpm --filter @lumaforge/luma-raw-runtime test:native-smoke`.'
const fixtureHint =
  'Run `pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public` before `pnpm --filter @lumaforge/luma-raw-runtime test:native-smoke`.'
const quickDecodeMaxOutputPixels = 2_500_000
const smokeTimeoutMs = 120_000

async function requireFile(absolutePath: string, label: string, hint: string) {
  let entry: Awaited<ReturnType<typeof stat>>
  try {
    entry = await stat(absolutePath)
  } catch {
    throw new Error(`Missing ${label}: ${absolutePath}\n${hint}`)
  }

  if (!entry.isFile()) {
    throw new Error(`Expected ${label} to be a file: ${absolutePath}`)
  }
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

function markCrossOriginIsolated() {
  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    configurable: true,
    value: true,
  })
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

async function loadSmokeNativeFactory() {
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

async function createNativeCore() {
  const nativeFactory = await loadSmokeNativeFactory()
  return createRuntimeCore(nativeFactory)
}

let nativeCorePromise: ReturnType<typeof createNativeCore> | undefined

function getNativeCore() {
  nativeCorePromise ??= createNativeCore()
  return nativeCorePromise
}

// Worker-compatible bridge for Vitest/jsdom; it still executes the real native
// loader and runtime core, so no native behavior is mocked.
class NativeSmokeWorker {
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

async function createRawFixtureFile() {
  const bytes = await readFile(publicRawFixturePath)
  return new File([new Uint8Array(bytes)], 'raw-pixls-iphone-se.dng', {
    type: 'image/x-adobe-dng',
  })
}

function expectPositiveDimension(value: unknown, label: string) {
  expect(value, label).toEqual(expect.any(Number))
  expect(value as number, label).toBeGreaterThan(0)
}

function expectValidEmbeddedPreview(preview: LumaEmbeddedPreview) {
  expect(preview.source).toBe('embedded')
  expect(preview.mimeType).toMatch(
    /^(image\/jpeg|image\/png|application\/octet-stream)$/,
  )
  expect(preview.colorSpace).toBe('display-srgb-preview')
  expectPositiveDimension(preview.width, 'embedded preview width')
  expectPositiveDimension(preview.height, 'embedded preview height')
  expect(preview.data).toBeInstanceOf(Uint8Array)
  expect(preview.data.length).toBeGreaterThan(0)
}

describe('native RAW runtime smoke test', () => {
  let restoreFetch: (() => void) | undefined

  beforeAll(async () => {
    await Promise.all([
      requireFile(
        nativeJsPath,
        'CI-built native runtime JS artifact',
        artifactHint,
      ),
      requireFile(
        nativeWasmPath,
        'CI-built native runtime WASM artifact',
        artifactHint,
      ),
      requireFile(
        publicRawFixturePath,
        'public RAW smoke fixture',
        fixtureHint,
      ),
    ])

    markCrossOriginIsolated()
    restoreFetch = installFileUrlFetchFallback()
  })

  afterAll(() => {
    restoreFetch?.()
  })

  it(
    'opens the public DNG fixture with CI-built native artifacts',
    async () => {
      const runtime = createLumaRawRuntime({
        workerFactory: () => new NativeSmokeWorker() as unknown as Worker,
      })

      try {
        const runtimeInfo = await runtime.init()
        expect(runtimeInfo).toMatchObject({
          crossOriginIsolated: true,
          runtime: 'luma',
          pthreads: true,
        })

        const session = await runtime.openSession(
          await createRawFixtureFile(),
          {
            maxOutputPixels: quickDecodeMaxOutputPixels,
          },
        )

        try {
          expectPositiveDimension(session.probe.width, 'metadata width')
          expectPositiveDimension(session.probe.height, 'metadata height')

          const preview = await session.extractEmbeddedPreview()
          if (preview !== null) {
            expectValidEmbeddedPreview(preview)
            return
          }

          const frame = await session.decodeQuick({
            maxOutputPixels: quickDecodeMaxOutputPixels,
          })
          expect(frame.source).toBe('quick')
          expect(frame.layout).toBe('rgb')
          expect(frame.bitDepth).toBe(16)
          expect(frame.colorSpace).toBe('linear-prophoto-rgb')
          expectPositiveDimension(frame.width, 'quick decode width')
          expectPositiveDimension(frame.height, 'quick decode height')
          expect(frame.data).toBeInstanceOf(Uint16Array)
          expect(frame.data.length).toBeGreaterThan(0)
        } finally {
          session.dispose()
        }
      } finally {
        runtime.dispose()
      }
    },
    smokeTimeoutMs,
  )
})
