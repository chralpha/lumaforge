import type {
  LumaRawFrame,
  LumaRawExportCapability,
  LumaRawRuntime,
  LumaRawRuntimeInfo,
} from '@lumaforge/luma-raw-runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { disposeLumaRawRuntime } from './luma-runtime-adapter'
import { createRawRuntimeAdapter } from './runtime-adapter'

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

function makeLumaFrame(source: 'quick' | 'hq') {
  return {
    jobId: `${source}-1`,
    source,
    width: 1,
    height: 1,
    data: new Uint16Array([0, 32768, 65535]),
    layout: 'rgb' as const,
    bitDepth: 16 as const,
    colorSpace: 'linear-prophoto-rgb' as const,
    orientation: 1,
    metadata: {
      width: 1,
      height: 1,
      supportLevel: 'experimental' as const,
    },
    timings: { total: 1 },
  }
}

function makeCapability(): LumaRawExportCapability {
  return {
    supported: true,
    width: 6240,
    height: 4168,
    rawWidth: 6240,
    rawHeight: 4168,
    visibleCrop: { x: 0, y: 0, width: 6240, height: 4168 },
    cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
    blackLevel: 0,
    whiteLevel: 16383,
    orientation: { code: 1, supported: true },
    color: {
      whiteBalance: [1, 1, 1, 1],
      cameraToWorkingRgb: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      workingSpace: 'linear-prophoto-rgb',
    },
    reasons: [],
  }
}

function makeLumaRuntime(
  dataOrOverrides: Uint16Array | Partial<LumaRawRuntime> = new Uint16Array([
    0, 32768, 65535,
  ]),
) {
  const data =
    dataOrOverrides instanceof Uint16Array
      ? dataOrOverrides
      : new Uint16Array([0, 32768, 65535])
  const overrides =
    dataOrOverrides instanceof Uint16Array ? {} : dataOrOverrides
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
      openSession: vi.fn<LumaRawRuntime['openSession']>().mockResolvedValue({
        sessionId: 'session-1',
        probe: {
          jobId: 'probe',
          width: 6240,
          height: 4168,
          supportLevel: 'experimental',
          timings: { total: 1 },
        },
        timings: { total: 1 },
        extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
        probeExportCapability: vi.fn().mockResolvedValue(makeCapability()),
        decodeQuick: vi.fn().mockResolvedValue(makeLumaFrame('quick')),
        decodeHq: vi.fn().mockResolvedValue(makeLumaFrame('hq')),
        dispose: vi.fn(),
      }),
      ...overrides,
    } satisfies LumaRawRuntime,
    quickFrame,
  }
}

afterEach(() => {
  disposeLumaRawRuntime()
  vi.clearAllMocks()
})

describe('raw runtime adapter', () => {
  it('uses the luma runtime by default without an env flag', async () => {
    const { runtime } = makeLumaRuntime()
    const adapter = createRawRuntimeAdapter({
      lumaRuntimeFactory: () => runtime,
    })

    await adapter.decodeQuickRaw(new File(['raw'], 'sample.ARW'))

    expect(runtime.init).toHaveBeenCalledTimes(1)
    expect(runtime.decodeQuick).toHaveBeenCalledTimes(1)
  })

  it('returns embedded preview bytes from the default luma runtime', async () => {
    const { runtime } = makeLumaRuntime()
    const adapter = createRawRuntimeAdapter({
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

  it('preserves stable luma runtime error codes', async () => {
    const { runtime } = makeLumaRuntime()
    const runtimeError = Object.assign(
      new Error('Cross-origin isolation is required.'),
      {
        code: 'RAW_CROSS_ORIGIN_ISOLATION_REQUIRED',
      },
    )
    vi.mocked(runtime.init).mockRejectedValue(runtimeError)
    const adapter = createRawRuntimeAdapter({
      lumaRuntimeFactory: () => runtime,
    })

    await expect(
      adapter.decodeQuickRaw(new File(['raw'], 'sample.ARW')),
    ).rejects.toMatchObject({
      code: 'RAW_CROSS_ORIGIN_ISOLATION_REQUIRED',
      message: 'Cross-origin isolation is required.',
    })
  })

  it('opens one luma session and decodes stages without rereading the file', async () => {
    const extractEmbeddedPreview = vi.fn().mockResolvedValue(null)
    const probeExportCapability = vi.fn().mockResolvedValue(makeCapability())
    const decodeQuick = vi.fn().mockResolvedValue(makeLumaFrame('quick'))
    const decodeHq = vi.fn().mockResolvedValue(makeLumaFrame('hq'))
    const dispose = vi.fn()
    const openSignal = new AbortController().signal
    const stageSignal = new AbortController().signal
    const { runtime } = makeLumaRuntime({
      openSession: vi.fn().mockResolvedValue({
        sessionId: 'session-1',
        probe: {
          jobId: 'probe',
          width: 6240,
          height: 4168,
          supportLevel: 'experimental',
          timings: { total: 1 },
        },
        timings: { total: 1 },
        extractEmbeddedPreview,
        probeExportCapability,
        decodeQuick,
        decodeHq,
        dispose,
      }),
    })

    const adapter = createRawRuntimeAdapter({
      lumaRuntimeFactory: () => runtime,
    })

    const file = new File(['raw'], 'sample.ARW')
    const session = await adapter.openSession(file, openSignal)
    await session.extractEmbeddedPreview(stageSignal)
    await session.probeExportCapability?.(stageSignal)
    await session.decodeQuickRaw(undefined, stageSignal)
    await session.decodeHqRaw(undefined, stageSignal)
    session.dispose()

    expect(runtime.openSession).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ maxOutputPixels: expect.any(Number) }),
      openSignal,
    )
    expect(extractEmbeddedPreview).toHaveBeenCalledWith(stageSignal)
    expect(probeExportCapability).toHaveBeenCalledWith(stageSignal)
    expect(decodeQuick).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputPixels: expect.any(Number) }),
      stageSignal,
    )
    expect(decodeHq).toHaveBeenCalledWith(stageSignal)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('fails export capability closed when the JPEG runtime is unavailable', async () => {
    const probeExportCapability = vi.fn().mockResolvedValue(makeCapability())
    const jpegRuntimeAvailabilityProbe = vi.fn().mockReturnValue(false)
    const { runtime } = makeLumaRuntime({
      openSession: vi.fn().mockResolvedValue({
        sessionId: 'session-1',
        probe: {
          jobId: 'probe',
          width: 6240,
          height: 4168,
          supportLevel: 'experimental',
          timings: { total: 1 },
        },
        timings: { total: 1 },
        extractEmbeddedPreview: vi.fn(),
        probeExportCapability,
        decodeQuick: vi.fn(),
        decodeHq: vi.fn(),
        dispose: vi.fn(),
      }),
    })
    const adapter = createRawRuntimeAdapter({
      lumaRuntimeFactory: () => runtime,
      jpegRuntimeAvailabilityProbe,
    })

    const session = await adapter.openSession(new File(['raw'], 'sample.ARW'))

    await expect(session.probeExportCapability?.()).resolves.toMatchObject({
      supported: false,
      reasons: ['jpeg-runtime-unavailable'],
    })
    expect(probeExportCapability).toHaveBeenCalledTimes(1)
    expect(jpegRuntimeAvailabilityProbe).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'missing-color-transform',
      { color: undefined },
      ['missing-color-transform'],
    ],
    [
      'unsupported-orientation',
      { orientation: { code: 6, supported: false } },
      ['unsupported-orientation'],
    ],
  ] as Array<[string, Partial<LumaRawExportCapability>, string[]]>)(
    'fails export capability closed for %s',
    async (_name, overrides, reasons) => {
      const jpegRuntimeAvailabilityProbe = vi.fn().mockReturnValue(true)
      const { runtime } = makeLumaRuntime({
        openSession: vi.fn().mockResolvedValue({
          sessionId: 'session-1',
          probe: {
            jobId: 'probe',
            width: 6240,
            height: 4168,
            supportLevel: 'experimental',
            timings: { total: 1 },
          },
          timings: { total: 1 },
          extractEmbeddedPreview: vi.fn(),
          probeExportCapability: vi
            .fn()
            .mockResolvedValue({ ...makeCapability(), ...overrides }),
          decodeQuick: vi.fn(),
          decodeHq: vi.fn(),
          dispose: vi.fn(),
        }),
      })
      const adapter = createRawRuntimeAdapter({
        lumaRuntimeFactory: () => runtime,
        jpegRuntimeAvailabilityProbe,
      })

      const session = await adapter.openSession(new File(['raw'], 'sample.ARW'))

      await expect(session.probeExportCapability?.()).resolves.toMatchObject({
        supported: false,
        reasons,
      })
      expect(jpegRuntimeAvailabilityProbe).not.toHaveBeenCalled()
    },
  )

  it('normalizes generic luma session open failures', async () => {
    const { runtime } = makeLumaRuntime({
      openSession: vi.fn().mockRejectedValue(new Error('open exploded')),
    })
    const adapter = createRawRuntimeAdapter({
      lumaRuntimeFactory: () => runtime,
    })

    await expect(
      adapter.openSession(new File(['raw'], 'sample.ARW')),
    ).rejects.toMatchObject({
      name: 'RawAdapterError',
      code: 'RAW_OPEN_FAILED',
      message: 'open exploded',
    })
  })

  it('normalizes generic luma session stage failures', async () => {
    const extractEmbeddedPreview = vi
      .fn()
      .mockRejectedValue(new Error('thumbnail exploded'))
    const decodeQuick = vi.fn().mockRejectedValue(new Error('quick exploded'))
    const decodeHq = vi.fn().mockRejectedValue(new Error('hq exploded'))
    const { runtime } = makeLumaRuntime({
      openSession: vi.fn().mockResolvedValue({
        sessionId: 'session-1',
        probe: {
          jobId: 'probe',
          width: 6240,
          height: 4168,
          supportLevel: 'experimental',
          timings: { total: 1 },
        },
        timings: { total: 1 },
        extractEmbeddedPreview,
        decodeQuick,
        decodeHq,
        dispose: vi.fn(),
      }),
    })
    const adapter = createRawRuntimeAdapter({
      lumaRuntimeFactory: () => runtime,
    })
    const session = await adapter.openSession(new File(['raw'], 'sample.ARW'))

    await expect(session.extractEmbeddedPreview()).rejects.toMatchObject({
      name: 'RawAdapterError',
      code: 'RAW_THUMBNAIL_UNAVAILABLE',
      message: 'thumbnail exploded',
    })
    await expect(session.decodeQuickRaw()).rejects.toMatchObject({
      name: 'RawAdapterError',
      code: 'RAW_QUICK_DECODE_FAILED',
      message: 'quick exploded',
    })
    await expect(session.decodeHqRaw()).rejects.toMatchObject({
      name: 'RawAdapterError',
      code: 'RAW_HQ_DECODE_FAILED',
      message: 'hq exploded',
    })
  })

  it('shares one singleton runtime across concurrent first luma calls', async () => {
    vi.resetModules()

    const { runtime } = makeLumaRuntime()
    const createLumaRawRuntime = vi.fn(() => runtime)
    vi.doMock('@lumaforge/luma-raw-runtime', () => ({
      createLumaRawRuntime,
    }))

    try {
      const { decodeQuickRawWithLuma, disposeLumaRawRuntime } =
        await import('./luma-runtime-adapter')

      await Promise.all([
        decodeQuickRawWithLuma(new File(['raw-a'], 'a.ARW')),
        decodeQuickRawWithLuma(new File(['raw-b'], 'b.ARW')),
      ])

      expect(createLumaRawRuntime).toHaveBeenCalledTimes(1)
      expect(runtime.decodeQuick).toHaveBeenCalledTimes(2)

      disposeLumaRawRuntime()
    } finally {
      vi.doUnmock('@lumaforge/luma-raw-runtime')
      vi.resetModules()
    }
  })
})
