import type { LumaRawFrame, LumaRawRuntime } from '@lumaforge/luma-raw-runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  resetCapabilityVectorForTest,
  setCapabilityVectorForTest,
} from '~/lib/runtime/capability-vector'

import {
  decodeQuickRawWithLuma,
  disposeLumaRawRuntime,
  terminateLumaRawDecodeBridge,
} from '../luma-runtime-adapter'

function makeFrame(): LumaRawFrame {
  return {
    jobId: 'quick-1',
    source: 'quick',
    width: 1,
    height: 1,
    data: new Uint16Array([0, 32768, 65535]),
    layout: 'rgb',
    bitDepth: 16,
    colorSpace: 'linear-prophoto-rgb',
    orientation: 1,
    metadata: {
      width: 1,
      height: 1,
      make: 'X',
      model: 'Y',
      supportLevel: 'experimental',
    },
    timings: { total: 1 },
  }
}

function fakeRuntime(
  signalRecorder?: (signal: AbortSignal | undefined) => void,
) {
  return {
    init: vi.fn(async () => ({}) as never),
    dispose: vi.fn(),
    openSession: vi.fn(async () => ({}) as never),
    probe: vi.fn(async () => ({}) as never),
    extractEmbeddedPreview: vi.fn(async () => null),
    decodeQuick: vi.fn(async (_file: File, signal?: AbortSignal) => {
      signalRecorder?.(signal)
      return makeFrame()
    }),
    decodeBoundedHq: vi.fn(async () => makeFrame()),
  } as unknown as LumaRawRuntime
}

afterEach(() => {
  disposeLumaRawRuntime()
  resetCapabilityVectorForTest()
  vi.doUnmock('@lumaforge/luma-raw-runtime')
})

describe('lumaRuntimeAdapter bridge migration', () => {
  it('produces a DecodedImage for a quick preview via RawDecodeBridge', async () => {
    const runtimeFactory = vi.fn(() => fakeRuntime())

    const result = await decodeQuickRawWithLuma(
      new File([], 'a.dng'),
      undefined,
      runtimeFactory,
    )

    expect(result.width).toBe(1)
    expect(runtimeFactory).toHaveBeenCalledTimes(1)
  })

  it('passes the caller AbortSignal through to the runtime decode', async () => {
    const seenSignals: Array<AbortSignal | undefined> = []
    const runtime = fakeRuntime((signal) => seenSignals.push(signal))
    const runtimeFactory = vi.fn(() => runtime)
    const controller = new AbortController()

    await decodeQuickRawWithLuma(
      new File([], 'a.dng'),
      undefined,
      runtimeFactory,
      controller.signal,
    )

    expect(seenSignals).toEqual([controller.signal])
  })

  it('terminates the active RawDecodeBridge runtime', async () => {
    const runtime = fakeRuntime()
    const runtimeFactory = vi.fn(() => runtime)

    await decodeQuickRawWithLuma(
      new File([], 'a.dng'),
      undefined,
      runtimeFactory,
    )
    await terminateLumaRawDecodeBridge()

    expect(runtime.dispose).toHaveBeenCalledTimes(1)
  })

  it('honours deriveInteractivePolicy for the preview runtime memory profile', async () => {
    setCapabilityVectorForTest({
      coi: true,
      pthread: true,
      deviceMemoryGB: 4,
      hwConcurrency: 4,
      webKitClass: 'webkit-mobile',
      maybeOpfsSupported: true,
    })
    const runtime = fakeRuntime()
    const createLumaRawRuntime = vi.fn(() => runtime)
    vi.doMock('@lumaforge/luma-raw-runtime', () => ({
      createLumaRawRuntime,
    }))

    await decodeQuickRawWithLuma(new File([], 'a.dng'))

    expect(createLumaRawRuntime).toHaveBeenCalledWith({
      memoryProfile: 'low-memory',
      requireCrossOriginIsolation: false,
    })
  })
})
