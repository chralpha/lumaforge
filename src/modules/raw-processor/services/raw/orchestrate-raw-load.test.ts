import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CapabilityVector } from '~/lib/runtime/capability-vector'

import { createImageSession } from '../../model/session-factory'
import type { RawLoadContext } from './orchestrate-raw-load'
import { orchestrateRawLoad } from './orchestrate-raw-load'

const capabilityVectorMock = vi.hoisted(() => ({
  detectCapabilityVector: vi.fn(),
  getCapabilityVectorSnapshot: vi.fn(),
}))

vi.mock('~/lib/raw/runtime-adapter', () => ({
  rawRuntimeAdapter: {
    openSession: vi.fn(),
    extractEmbeddedPreview: vi.fn(),
    decodeQuickRaw: vi.fn(),
    decodeBoundedHqRaw: vi.fn(),
    prewarm: vi.fn(),
    getPrewarmState: vi.fn(),
  },
}))

vi.mock('~/lib/runtime/capability-vector', () => capabilityVectorMock)

const defaultParams: ProcessingParams = {
  intensity: 0.7,
  viewMode: 'compare',
  compareSplit: 0.5,
  styleKind: 'none',
  builtinPreset: null,
  userExposureEv: 0,
  userContrast: 0,
  userHighlights: 0,
  userShadows: 0,
  userWhites: 0,
  userBlacks: 0,
}

interface OrderingHooks {
  order: string[]
  yieldToPaint: () => Promise<void>
  prewarm?: () => Promise<{
    status: 'ready' | 'failed'
    reason?: string
    recoverable?: boolean
  }>
  openSession?: () => Promise<never>
  getPrewarmState: () => 'idle' | 'pending' | 'ready' | 'failed'
}

function buildContext(hooks: OrderingHooks): RawLoadContext {
  const { order } = hooks
  return {
    atoms: {
      setStatus: vi.fn((status) => order.push(`status:${status}`)),
      setError: vi.fn(),
      setProgress: vi.fn(),
      setLoadedImage: vi.fn(),
      getProcessingParams: vi.fn(() => defaultParams),
      setParams: vi.fn(),
      setSession: vi.fn(),
      setDecodedImageVersion: vi.fn(),
      setStats: vi.fn(),
      setPendingRecoveryRetry: vi.fn(),
    },
    services: {
      scheduleToast: vi.fn(),
      replaceFile: vi.fn((file) => {
        order.push('replaceFile')
        return createImageSession(file)
      }),
      abortRuntimeWork: vi.fn(() => order.push('abortRuntimeWork')),
      abortExportWork: vi.fn(() => order.push('abortExportWork')),
      queueExportResultResourceDisposal: vi.fn(),
      revokeCurrentEmbeddedPreviewUrl: vi.fn(),
      clearSessionEmbeddedPreviewUrl: vi.fn(),
      setDecodedImageRef: vi.fn(),
      invalidateExportGraph: vi.fn(),
      registerCurrentPreviewPipelineForEvacuation: vi.fn(),
      disposeRuntimeSession: vi.fn(),
      yieldToPaint: vi.fn(async () => {
        order.push('yieldToPaint')
        await hooks.yieldToPaint()
      }),
      getPrewarmState: hooks.getPrewarmState,
      prewarm:
        hooks.prewarm ??
        (async () => {
          order.push('prewarm')
          return { status: 'ready' as const }
        }),
    },
    refs: {
      runtimeAbortControllerRef: { current: null },
      runtimeSessionRef: { current: null },
      disposedRuntimeSessionsRef: { current: new WeakSet() },
      decodedImageRef: { current: null },
      sessionRef: { current: null },
      pipelineRef: { current: null },
      resourceRegistryRef: { current: null },
      embeddedPreviewUrlRef: { current: null },
      isMountedRef: { current: true },
      runtimeWorkSessionIdRef: { current: null },
      pendingLoadSessionIdRef: { current: null },
      previewPipelineResourceIdRef: { current: 0 },
      previewCopyCanvasRef: { current: null },
    },
  }
}

async function flushMicrotasks(rounds = 4) {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve()
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return { promise, resolve, reject }
}

describe('orchestrateRawLoad ack-before-work contract', () => {
  const defaultCapability: CapabilityVector = {
    coi: false,
    pthread: false,
    deviceMemoryGB: null,
    hwConcurrency: 2,
    webKitClass: 'unknown',
    maybeOpfsSupported: false,
  }

  beforeEach(async () => {
    const { rawRuntimeAdapter } = await import('~/lib/raw/runtime-adapter')
    vi.mocked(rawRuntimeAdapter.openSession).mockReset()

    capabilityVectorMock.getCapabilityVectorSnapshot.mockReset()
    capabilityVectorMock.detectCapabilityVector
      .mockReset()
      .mockResolvedValue(defaultCapability)
  })

  it('commits visible status and sync setup before awaiting the paint boundary', async () => {
    const order: string[] = []
    const { rawRuntimeAdapter } = await import('~/lib/raw/runtime-adapter')
    vi.mocked(rawRuntimeAdapter.openSession).mockImplementation(
      () =>
        new Promise(() => {
          order.push('openSession')
        }),
    )

    let resolvePaint: () => void = () => {}
    const paintGate = new Promise<void>((resolve) => {
      resolvePaint = resolve
    })

    const ctx = buildContext({
      order,
      yieldToPaint: () => paintGate,
      getPrewarmState: () => 'ready',
    })

    const file = new File(['raw'], 'sample.ARW')
    const loadPromise = orchestrateRawLoad(file, defaultParams, null, null, ctx)

    await flushMicrotasks()

    expect(order[0]).toBe('status:loading')
    expect(order).toContain('yieldToPaint')
    expect(order).toContain('replaceFile')
    expect(order).toContain('abortRuntimeWork')
    expect(order.indexOf('replaceFile')).toBeLessThan(
      order.indexOf('yieldToPaint'),
    )
    expect(order).not.toContain('openSession')

    resolvePaint()
    await flushMicrotasks()

    expect(order).toContain('openSession')
    expect(order.indexOf('yieldToPaint')).toBeLessThan(
      order.indexOf('openSession'),
    )

    loadPromise.catch(() => undefined)
  })

  it('does not open a runtime session when superseded during capability detection', async () => {
    const order: string[] = []
    const { rawRuntimeAdapter } = await import('~/lib/raw/runtime-adapter')
    const capability = deferred<CapabilityVector>()
    capabilityVectorMock.detectCapabilityVector.mockReturnValue(
      capability.promise,
    )
    vi.mocked(rawRuntimeAdapter.openSession).mockImplementation(
      () =>
        new Promise(() => {
          order.push('openSession')
        }),
    )

    const ctx = buildContext({
      order,
      yieldToPaint: () => Promise.resolve(),
      getPrewarmState: () => 'ready',
    })

    const file = new File(['raw'], 'sample.ARW')
    const loadPromise = orchestrateRawLoad(file, defaultParams, null, null, ctx)

    await flushMicrotasks()

    ctx.refs.runtimeWorkSessionIdRef.current = 'newer-session'
    capability.resolve(defaultCapability)
    await loadPromise

    expect(rawRuntimeAdapter.openSession).not.toHaveBeenCalled()
  })

  it('enters warming when prewarm is pending and flips to loading after prewarm resolves', async () => {
    const order: string[] = []
    const { rawRuntimeAdapter } = await import('~/lib/raw/runtime-adapter')
    vi.mocked(rawRuntimeAdapter.openSession).mockImplementation(
      () => new Promise(() => {}),
    )

    let resolvePrewarm: (outcome: {
      status: 'ready' | 'failed'
      reason?: string
    }) => void = () => {}
    const prewarmPromise = new Promise<{
      status: 'ready' | 'failed'
      reason?: string
    }>((resolve) => {
      resolvePrewarm = resolve
    })

    const ctx = buildContext({
      order,
      yieldToPaint: () => Promise.resolve(),
      getPrewarmState: () => 'pending',
      prewarm: () => prewarmPromise,
    })

    const file = new File(['raw'], 'sample.ARW')
    const loadPromise = orchestrateRawLoad(file, defaultParams, null, null, ctx)

    await flushMicrotasks()

    expect(order[0]).toBe('status:warming')
    expect(order).not.toContain('status:loading')

    resolvePrewarm({ status: 'ready' })
    await flushMicrotasks()

    expect(order).toContain('status:loading')
    expect(order.indexOf('status:warming')).toBeLessThan(
      order.indexOf('status:loading'),
    )

    loadPromise.catch(() => undefined)
  })
})
