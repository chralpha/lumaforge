/// <reference types="node" />

import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { NativeJpegModule } from '../worker/native-adapter'
import { createNativeJpegEncoderFactory } from '../worker/native-adapter'

type NativeModuleFactory = (options?: {
  locateFile?: (path: string) => string
}) => Promise<unknown>

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const nativeJsPath = join(packageDir, 'dist', 'native', 'luma_jpeg.js')
const nativeWasmPath = join(packageDir, 'dist', 'native', 'luma_jpeg.wasm')
const artifactHint =
  'Run `pnpm --filter @lumaforge/luma-jpeg-runtime build:native` before `pnpm --filter @lumaforge/luma-jpeg-runtime test:native-smoke`.'
const JPEG_SOI_MARKER = 65_496
const JPEG_EOI_MARKER = 65_497

async function requireFile(absolutePath: string, label: string) {
  let entry: Awaited<ReturnType<typeof stat>>
  try {
    entry = await stat(absolutePath)
  } catch {
    throw new Error(`Missing ${label}: ${absolutePath}\n${artifactHint}`)
  }

  if (!entry.isFile()) {
    throw new Error(`Expected ${label} to be a file: ${absolutePath}`)
  }
}

function readWord(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1]
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
        headers: {
          'Content-Type': url.endsWith('.wasm')
            ? 'application/wasm'
            : 'application/octet-stream',
        },
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

async function loadNativeJpegEncoderFactory() {
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

  return createNativeJpegEncoderFactory(module as NativeJpegModule)
}

describe('native JPEG runtime smoke test', () => {
  let restoreFetch: (() => void) | undefined
  let createEncoder: Awaited<
    ReturnType<typeof loadNativeJpegEncoderFactory>
  > | null = null

  beforeAll(async () => {
    await Promise.all([
      requireFile(nativeJsPath, 'CI-built native JPEG runtime JS artifact'),
      requireFile(nativeWasmPath, 'CI-built native JPEG runtime WASM artifact'),
    ])

    restoreFetch = installFileUrlFetchFallback()
    createEncoder = await loadNativeJpegEncoderFactory()
  })

  afterAll(() => {
    restoreFetch?.()
  })

  it('encodes a tiny RGB image through the CI-built native artifacts', async () => {
    if (!createEncoder) {
      throw new Error('JPEG_NATIVE_SMOKE_NOT_INITIALIZED')
    }

    const encoder = createEncoder({ width: 2, height: 1, quality: 0.92 })
    await encoder.writeRows(new Uint8Array([255, 0, 0, 0, 255, 0]), 1)
    const blob = await encoder.finish()
    const bytes = new Uint8Array(await blob.arrayBuffer())

    expect(blob.type).toBe('image/jpeg')
    expect(bytes.length).toBeGreaterThan(4)
    expect(readWord(bytes, 0)).toBe(JPEG_SOI_MARKER)
    expect(readWord(bytes, bytes.length - 2)).toBe(JPEG_EOI_MARKER)
  })

  it('surfaces native row overrun validation', async () => {
    if (!createEncoder) {
      throw new Error('JPEG_NATIVE_SMOKE_NOT_INITIALIZED')
    }

    const encoder = createEncoder({ width: 1, height: 1, quality: 0.92 })
    await encoder.writeRows(new Uint8Array([0, 0, 0]), 1)

    await expect(
      encoder.writeRows(new Uint8Array([0, 0, 0]), 1),
    ).rejects.toThrow('JPEG_ROW_COUNT_EXCEEDED')
    await expect(encoder.finish()).rejects.toThrow('JPEG_RUNTIME_ABORTED')
  })
})
