/// <reference types="node" />

import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

type NativeModuleFactory = (options?: {
  locateFile?: (path: string) => string
}) => Promise<unknown>

interface SpikeResult {
  data: Uint16Array
  width: number
  height: number
  rgbCamBefore: number[]
  rgbCamAfter: number[]
  preMulBefore: number[]
  preMulAfter: number[]
}

interface SpikeProcessor {
  loadBuffer: (data: Uint8Array) => unknown
  openBuffer: (data: Uint8Array, settings: unknown) => unknown
  applyDcpParamsSpike: (settings: unknown, matrix: number[]) => SpikeResult
  delete?: () => void
}

interface SpikeModule {
  LumaRawProcessor: new () => SpikeProcessor
}

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const nativeProfile = 'desktop'
const nativeJsPath = join(
  packageDir,
  'dist',
  'native',
  nativeProfile,
  'luma_raw.js',
)
const nativeWasmPath = join(
  packageDir,
  'dist',
  'native',
  nativeProfile,
  'luma_raw.wasm',
)
const publicRawFixturePath = join(
  packageDir,
  'fixtures',
  '.cache',
  'public',
  'raw-pixls-iphone-se.dng',
)

const artifactsAvailable =
  existsSync(nativeJsPath) &&
  existsSync(nativeWasmPath) &&
  existsSync(publicRawFixturePath)
const skipReason = artifactsAvailable
  ? ''
  : 'native artifacts or public RAW fixture missing — run pnpm build:native:desktop and pnpm fixtures:fetch-public'

const strictExportSettings = {
  halfSize: false,
  useCameraWb: true,
  useAutoWb: false,
  outputColor: 4,
  outputBps: 16,
  noAutoBright: true,
  useCameraMatrix: 1,
  bright: 1,
  highlight: 2,
  userQual: 0,
  gamm: [1, 1, 1, 1, 0, 0],
}

// Two distinct, well-conditioned XYZ-to-Camera 3x3 matrices (row-major) used
// to drive the spike. Matrix A is an Adobe-like Bayer DCP first illuminant
// (approx Daylight) for a generic camera; matrix B is the same scene with the
// channels permuted to guarantee a very different rgb_cam. Realistic numerics
// keep cam_xyz_coeff numerically stable (non-degenerate normalize+pseudoinv).
const MATRIX_A = [0.7, 0.2, 0.1, 0.3, 0.85, -0.15, -0.05, 0.1, 0.95]

const MATRIX_B = [0.4, 0.5, 0.1, 0.1, 0.6, 0.3, 0.05, 0.25, 0.7]

async function loadNativeModule(): Promise<SpikeModule> {
  // Mirror the file:// fallback pattern from native-smoke so emscripten's
  // fetch() of luma_raw.wasm resolves under jsdom.
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

  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    configurable: true,
    value: true,
  })

  const moduleImport = (await import(
    /* @vite-ignore */ pathToFileURL(nativeJsPath).href
  )) as { default: NativeModuleFactory }

  const module = (await moduleImport.default({
    locateFile(path) {
      if (path.endsWith('.wasm')) {
        return pathToFileURL(nativeWasmPath).href
      }
      return path
    },
  })) as SpikeModule

  return module
}

function l2Distance(a: Uint16Array, b: Uint16Array): number {
  if (a.length !== b.length) {
    throw new Error(`length mismatch: ${a.length} vs ${b.length}`)
  }
  let sum = 0
  for (let i = 0; i < a.length; ++i) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum)
}

function bytesEqual(a: Uint16Array, b: Uint16Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false
  }
  return true
}

describe.skipIf(!artifactsAvailable)(
  'native DCP matrix-injection spike',
  () => {
    let modulePromise: Promise<SpikeModule>
    let rawBytes: Uint8Array

    beforeAll(async () => {
      if (!artifactsAvailable) return
      await Promise.all([
        stat(nativeJsPath),
        stat(nativeWasmPath),
        stat(publicRawFixturePath),
      ])
      rawBytes = new Uint8Array(await readFile(publicRawFixturePath))
      modulePromise = loadNativeModule()
    }, 60_000)

    it('two distinct XYZ-to-Camera matrices produce different RGB output and the same matrix is bit-identical when re-applied', async () => {
      if (!artifactsAvailable) {
         
        console.warn(skipReason)
        return
      }

      const module = await modulePromise
      const processor = new module.LumaRawProcessor()

      try {
        // Establish input buffer; settings here are unused (the spike entry
        // re-applies its own settings) but openBuffer is required for the
        // input_buffer_ to be populated.
        processor.openBuffer(rawBytes, strictExportSettings)

        // ---- Matrix A, first pass ----
        const a1 = processor.applyDcpParamsSpike(strictExportSettings, MATRIX_A)
        // ---- Matrix B ----
        const b1 = processor.applyDcpParamsSpike(strictExportSettings, MATRIX_B)
        // ---- Matrix A, idempotency pass ----
        const a2 = processor.applyDcpParamsSpike(strictExportSettings, MATRIX_A)

        // Sanity: every pass produced the same image dimensions.
        expect(a1.width).toBe(b1.width)
        expect(a1.height).toBe(b1.height)
        expect(a2.width).toBe(a1.width)
        expect(a2.height).toBe(a1.height)

        // rgb_cam must reflect the injection (i.e. rgb_cam_after differs
        // between A and B for the same RAW).
        const rgbA = a1.rgbCamAfter.slice(0, 9)
        const rgbB = b1.rgbCamAfter.slice(0, 9)
        const rgbDelta = rgbA.reduce(
          (acc, v, i) => acc + Math.abs(v - rgbB[i]),
          0,
        )
        // eslint-disable-next-line no-console
        console.log(
          `[spike] rgb_cam[A] = ${rgbA.map((v) => v.toFixed(4)).join(', ')}`,
        )
        // eslint-disable-next-line no-console
        console.log(
          `[spike] rgb_cam[B] = ${rgbB.map((v) => v.toFixed(4)).join(', ')}`,
        )
        // eslint-disable-next-line no-console
        console.log(`[spike] |rgb_cam[A]-rgb_cam[B]| L1 = ${rgbDelta}`)
        expect(rgbDelta).toBeGreaterThan(0.01)

        // pre_mul behavior diagnostics — informational only; scale_colors
        // overrides pre_mul when use_camera_wb=1 and cam_mul is valid.
        // eslint-disable-next-line no-console
        console.log(`[spike] pre_mul[A]_after = ${a1.preMulAfter.join(', ')}`)
        // eslint-disable-next-line no-console
        console.log(`[spike] pre_mul[B]_after = ${b1.preMulAfter.join(', ')}`)

        // L2 distance between A and B outputs.
        const ab = l2Distance(a1.data, b1.data)
        // eslint-disable-next-line no-console
        console.log(
          `[spike] L2(A,B) = ${ab.toFixed(2)} over ${a1.data.length} samples (${a1.width}x${a1.height})`,
        )
        // Threshold: outputs must differ substantially. Empirically a 3x3
        // matrix permutation that touches all channels yields L2 in the
        // millions over a multi-megapixel 16-bit RGB frame; we use a
        // conservative floor of 1_000 to clear noise but flag identical
        // outputs hard.
        expect(ab).toBeGreaterThan(1_000)

        // L2 distance between A and A (idempotency) must be exactly 0.
        const aa = l2Distance(a1.data, a2.data)
        // eslint-disable-next-line no-console
        console.log(`[spike] L2(A,A') = ${aa}`)
        expect(aa).toBe(0)
        expect(bytesEqual(a1.data, a2.data)).toBe(true)
      } finally {
        processor.delete?.()
      }
    }, 180_000)
  },
)
