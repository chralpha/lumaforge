import type { LumaRawRuntime } from '@lumaforge/luma-raw-runtime'
import { describe, expect, it, vi } from 'vitest'

import { RawDecodeBridge } from './raw-decode-bridge'

function fakeRuntime(): LumaRawRuntime {
  return {
    init: vi.fn(async () => ({}) as never),
    dispose: vi.fn(),
    openSession: vi.fn(async () => ({}) as never),
    probe: vi.fn(async () => ({}) as never),
    extractEmbeddedPreview: vi.fn(async () => null),
    decodeQuick: vi.fn(async () => ({}) as never),
    decodeBoundedHq: vi.fn(async () => ({}) as never),
  } as unknown as LumaRawRuntime
}

describe('rawDecodeBridge', () => {
  it('lazy-creates the runtime exactly once across concurrent decodes', async () => {
    const factory = vi.fn(fakeRuntime)
    const bridge = new RawDecodeBridge({
      runtimeFactory: factory,
      idleMs: 10_000,
    })
    const signal = new AbortController().signal

    await Promise.all([
      bridge.decodeEmbedded(signal, new File([], 'a.dng')),
      bridge.decodeQuick(signal, new File([], 'a.dng')),
    ])

    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('re-creates the runtime after terminate()', async () => {
    const factory = vi.fn(fakeRuntime)
    const bridge = new RawDecodeBridge({ runtimeFactory: factory })
    const signal = new AbortController().signal

    await bridge.decodeEmbedded(signal, new File([], 'a.dng'))
    await bridge.terminate()
    await bridge.decodeEmbedded(signal, new File([], 'a.dng'))

    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('prewarms by calling runtime init through the bridge', async () => {
    const runtime = fakeRuntime()
    const bridge = new RawDecodeBridge({ runtimeFactory: () => runtime })

    await bridge.prewarm(new AbortController().signal)

    expect(runtime.init).toHaveBeenCalledTimes(1)
  })
})
