// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createProcessorSession,
  hqSettings,
  loadNativeFactory,
  normalizeMetadata,
  quickSettings,
  readNativeStage,
} from './native-diagnostics-runtime.mjs'

describe('native diagnostics runtime bridge', () => {
  it('matches quick and HQ runtime policy settings', () => {
    expect(quickSettings).toMatchObject({
      halfSize: true,
      useCameraWb: true,
      outputColor: 4,
      outputBps: 16,
      noAutoBright: true,
      useAutoWb: false,
      useCameraMatrix: 1,
      bright: 1,
      highlight: 2,
      userQual: 0,
      gamm: [1, 1, 1, 1, 0, 0],
    })

    expect(hqSettings).toMatchObject({
      ...quickSettings,
      halfSize: false,
      userQual: 2,
    })
  })

  it('normalizes native metadata to report-safe fields', () => {
    expect(
      normalizeMetadata({
        make: 'Google',
        model: 'Pixel 8 Pro',
        width: 4080,
        height: 3072,
        rawWidth: 4096,
        rawHeight: 3072,
        orientation: 1,
        baselineExposure: 0.25,
        thumbnail: { width: 640, height: 480, format: 'jpeg' },
      }),
    ).toEqual({
      make: 'Google',
      model: 'Pixel 8 Pro',
      width: 4080,
      height: 3072,
      rawWidth: 4096,
      rawHeight: 3072,
      orientation: 1,
      baselineExposure: 0.25,
      thumbnail: { width: 640, height: 480, format: 'jpeg' },
    })
  })

  it('strips thumbnail payloads from normalized metadata', () => {
    expect(
      normalizeMetadata({
        thumbnail: {
          width: 640,
          height: 480,
          format: 'jpeg',
          data: new Uint8Array([1]),
        },
      }),
    ).toEqual({
      thumbnail: {
        width: 640,
        height: 480,
        format: 'jpeg',
      },
    })
  })

  it('captures native stage successes and errors', async () => {
    await expect(readNativeStage(() => 'ok')).resolves.toMatchObject({
      stage: { ok: true },
      value: 'ok',
    })

    const error = Object.assign(new Error('native failed'), {
      code: 'RAW_OPEN_FAILED',
    })

    await expect(
      readNativeStage(() => {
        throw error
      }),
    ).resolves.toMatchObject({
      stage: {
        ok: false,
        code: 'RAW_OPEN_FAILED',
        message: 'native failed',
      },
      value: undefined,
    })
  })

  it('opens processors with quick settings and disposes them once', () => {
    const calls = []
    const processor = {
      loadBuffer(bytes) {
        calls.push(['loadBuffer', bytes.byteLength])
      },
      openWithSettings(settings) {
        calls.push(['openWithSettings', settings])
      },
      delete() {
        calls.push(['delete'])
      },
    }

    const session = createProcessorSession(
      { createProcessor: () => processor },
      new Uint8Array([1, 2, 3]),
    )

    session.open(quickSettings)
    session.dispose()
    session.dispose()

    expect(calls).toEqual([
      ['loadBuffer', 3],
      ['openWithSettings', quickSettings],
      ['delete'],
    ])
  })

  it('loads native factories with a local file URL wasm fetch fallback', async () => {
    const packageDir = await mkdtemp(
      path.join(os.tmpdir(), 'luma-raw-native-loader-'),
    )
    const nativeDir = path.join(packageDir, 'dist/native/desktop')
    const originalFetch = globalThis.fetch

    try {
      await mkdir(nativeDir, { recursive: true })
      await writeFile(
        path.join(nativeDir, 'luma_raw.wasm'),
        new Uint8Array([0]),
      )
      await writeFile(
        path.join(nativeDir, 'luma_raw.js'),
        `
export default async function createModule(options) {
  await fetch(options.locateFile('luma_raw.wasm')).then((response) =>
    response.arrayBuffer(),
  )

  return {
    LumaRawProcessor: class LumaRawProcessor {},
  }
}
`,
      )

      const nativeFactory = await loadNativeFactory({
        packageDir,
        profile: 'desktop',
      })

      expect(nativeFactory.createProcessor()).toBeInstanceOf(Object)
      expect(globalThis.fetch).toBe(originalFetch)
    } finally {
      expect(globalThis.fetch).toBe(originalFetch)
      await rm(packageDir, { recursive: true, force: true })
    }
  })
})
