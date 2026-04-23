import type {
  LumaRawFrame,
  LumaRawRuntime,
  LumaRawRuntimeInfo,
} from '@lumaforge/luma-raw-runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { disposeLumaRawRuntime } from './luma-runtime-adapter'
import type { RawRuntimeKind } from './runtime-adapter'
import { createRawRuntimeAdapter, runtimeKindFromEnv } from './runtime-adapter'

const originalRuntimeKind = import.meta.env.VITE_RAW_RUNTIME

function setRawRuntimeEnv(value: RawRuntimeKind | undefined) {
  const env = import.meta.env as ImportMetaEnv & {
    VITE_RAW_RUNTIME?: RawRuntimeKind
  }

  if (value) {
    env.VITE_RAW_RUNTIME = value
    return
  }

  delete env.VITE_RAW_RUNTIME
}

function makeRuntimeInfo(): LumaRawRuntimeInfo {
  return {
    runtime: 'luma',
    version: '0.1.0',
    simd: true,
    pthreads: true,
    crossOriginIsolated: true,
    memoryTier: 'normal',
    workerPoolSize: 2,
  }
}

function makeFrame(data: Uint16Array): LumaRawFrame {
  return {
    jobId: 'quick-1',
    source: 'quick',
    width: 1,
    height: 1,
    data,
    layout: 'rgb',
    bitDepth: 16,
    colorSpace: 'linear-prophoto-rgb',
    orientation: 1,
    metadata: {
      width: 1,
      height: 1,
      make: 'Sony',
      model: 'A7',
      supportLevel: 'experimental',
    },
    timings: { total: 20 },
  }
}

function makeLumaRuntime(data = new Uint16Array([0, 32768, 65535])) {
  const quickFrame = makeFrame(data)

  return {
    runtime: {
      init: vi
        .fn<LumaRawRuntime['init']>()
        .mockResolvedValue(makeRuntimeInfo()),
      probe: vi.fn<LumaRawRuntime['probe']>(),
      extractEmbeddedPreview: vi
        .fn<LumaRawRuntime['extractEmbeddedPreview']>()
        .mockResolvedValue({
          jobId: 'embedded-1',
          source: 'embedded',
          width: 1600,
          height: 1067,
          data: new Uint8Array([1, 2, 3]),
          mimeType: 'image/jpeg',
          colorSpace: 'display-srgb-preview',
          orientation: 1,
          timings: { total: 10 },
        }),
      decodeQuick: vi
        .fn<LumaRawRuntime['decodeQuick']>()
        .mockResolvedValue(quickFrame),
      decodeHq: vi.fn<LumaRawRuntime['decodeHq']>().mockResolvedValue({
        ...quickFrame,
        jobId: 'hq-1',
        source: 'hq',
      }),
      dispose: vi.fn<LumaRawRuntime['dispose']>(),
    } satisfies LumaRawRuntime,
    quickFrame,
  }
}

afterEach(() => {
  setRawRuntimeEnv(originalRuntimeKind)
  disposeLumaRawRuntime()
  vi.clearAllMocks()
})

describe('raw runtime adapter', () => {
  it('returns embedded preview bytes from an injected luma runtime', async () => {
    const { runtime } = makeLumaRuntime()
    const adapter = createRawRuntimeAdapter({
      runtimeKind: 'luma',
      lumaRuntimeFactory: () => runtime,
    })

    const preview = await adapter.extractEmbeddedPreview(
      new File(['raw'], 'sample.ARW'),
    )

    expect(preview).toMatchObject({
      width: 1600,
      height: 1067,
      mimeType: 'image/jpeg',
    })
    expect(preview?.data).toEqual(new Uint8Array([1, 2, 3]))
    expect(runtime.init).toHaveBeenCalledTimes(1)
    expect(runtime.extractEmbeddedPreview).toHaveBeenCalledTimes(1)
  })

  it('preserves RGB16 Linear ProPhoto quick decode data', async () => {
    const quickData = new Uint16Array([0, 32768, 65535])
    const { runtime } = makeLumaRuntime(quickData)
    const adapter = createRawRuntimeAdapter({
      runtimeKind: 'luma',
      lumaRuntimeFactory: () => runtime,
    })

    const image = await adapter.decodeQuickRaw(new File(['raw'], 'sample.ARW'))

    expect(image.data).toBe(quickData)
    expect(image.data).toBeInstanceOf(Uint16Array)
    expect(image.channels).toBe(3)
    expect(image.bitsPerChannel).toBe(16)
    expect(image.layout).toBe('rgb-u16')
    expect(image.colorSpace).toBe('linear-prophoto-rgb')
    expect(image.source).toBe('quick')
    expect(image.metadata).toMatchObject({
      make: 'Sony',
      model: 'A7',
      width: 1,
      height: 1,
      orientation: 1,
    })
  })

  it('keeps legacy runtime as the default and has no embedded preview', async () => {
    setRawRuntimeEnv(undefined)

    const adapter = createRawRuntimeAdapter()

    expect(runtimeKindFromEnv()).toBe('libraw-wasm')
    await expect(
      adapter.extractEmbeddedPreview(new File(['raw'], 'sample.ARW')),
    ).resolves.toBeNull()
  })

  it('selects luma only when the env flag is exactly luma', () => {
    setRawRuntimeEnv('libraw-wasm')
    expect(runtimeKindFromEnv()).toBe('libraw-wasm')

    setRawRuntimeEnv('luma')
    expect(runtimeKindFromEnv()).toBe('luma')
  })
})
