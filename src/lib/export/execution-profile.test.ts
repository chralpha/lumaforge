import { afterEach, vi } from 'vitest'

import type { ExportExecutionProfileName } from './execution-profile'
import {
  emitExportDebugEvent,
  getExportModeCopy,
  selectExportExecutionPlan,
} from './execution-profile'

const exportDebugEventStorageKey = 'lumaforge.exportDebugEvents.v1'

function clearExportDebugDiagnostics() {
  localStorage.clear()
  delete (
    window as unknown as {
      __LUMAFORGE_EXPORT_DEBUG_HISTORY__?: unknown
    }
  ).__LUMAFORGE_EXPORT_DEBUG_HISTORY__
}

describe('export execution profile selection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('forces ios-safe after interrupted checkpoint regardless of platform', () => {
    const plan = selectExportExecutionPlan({
      fidelity: 'max',
      sourceWidth: 11662,
      sourceHeight: 8746,
      previousInterrupted: true,
      runtime: { lowMemoryAvailable: true, pthreadAvailable: true },
      output: { opfsAvailable: true, streamingAvailable: true },
      platform: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', touch: false },
    })

    expect(plan.profile.name).toBe('ios-safe')
    expect(plan.preferredRows).toBe(64)
    expect(plan.concurrency).toBe(1)
    expect(plan.runtimeMemoryProfile).toBe('low-memory')
    expect(plan.checkpointMode).toBe('safe-retry')
    expect(plan.outputSink).toBe('opfs-file')
  })

  it('uses ios-safe for iPhone WebKit-like environments', () => {
    const plan = selectExportExecutionPlan({
      fidelity: 'balanced',
      sourceWidth: 11662,
      sourceHeight: 8746,
      runtime: { lowMemoryAvailable: true, pthreadAvailable: true },
      output: { opfsAvailable: true, streamingAvailable: false },
      platform: {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        touch: true,
      },
    })

    expect(plan.profile.name).toBe('ios-safe')
    expect(plan.maxConcurrency).toBe(1)
    expect(plan.preferredRows).toBe(64)
  })

  it('marks iPhone WebKit large blob handoff exports as unable to complete safely', () => {
    const plan = selectExportExecutionPlan({
      fidelity: 'balanced',
      sourceWidth: 9566,
      sourceHeight: 6374,
      runtime: { lowMemoryAvailable: true, pthreadAvailable: false },
      output: { opfsAvailable: false, streamingAvailable: false },
      platform: {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        touch: true,
      },
    })

    expect(plan.profile.name).toBe('ios-safe')
    expect(plan.outputSink).toBe('blob-handoff')
    expect(plan.productCopy).toBe('cannot-safely-complete')
    expect(getExportModeCopy(plan.productCopy)).toMatch(
      /cannot safely complete this large local full-resolution export/i,
    )
  })

  it('keeps smaller iPhone WebKit blob handoff exports allowed', () => {
    const plan = selectExportExecutionPlan({
      fidelity: 'balanced',
      sourceWidth: 6048,
      sourceHeight: 4024,
      runtime: { lowMemoryAvailable: true, pthreadAvailable: false },
      output: { opfsAvailable: false, streamingAvailable: false },
      platform: {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        touch: true,
      },
    })

    expect(plan.profile.name).toBe('ios-safe')
    expect(plan.outputSink).toBe('blob-handoff')
    expect(plan.productCopy).toBe('safe-export')
  })

  it('uses ios-safe for iPadOS Safari desktop-mode user agents with touch', () => {
    const plan = selectExportExecutionPlan({
      fidelity: 'max',
      sourceWidth: 11662,
      sourceHeight: 8746,
      runtime: { lowMemoryAvailable: true, pthreadAvailable: true },
      output: { opfsAvailable: true, streamingAvailable: false },
      platform: {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
        touch: true,
      },
    })

    expect(plan.profile.name).toBe('ios-safe')
    expect(plan.preferredRows).toBe(64)
    expect(plan.concurrency).toBe(1)
    expect(plan.runtimeMemoryProfile).toBe('low-memory')
  })

  it('uses ios-safe for desktop Safari WebKit workers', () => {
    const plan = selectExportExecutionPlan({
      fidelity: 'balanced',
      sourceWidth: 5520,
      sourceHeight: 8288,
      runtime: { lowMemoryAvailable: true, pthreadAvailable: true },
      output: { opfsAvailable: false, streamingAvailable: false },
      platform: {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Safari/605.1.15',
        touch: false,
        hardwareConcurrency: 8,
      },
    })

    expect(plan.profile.name).toBe('ios-safe')
    expect(plan.preferredRows).toBe(128)
    expect(plan.concurrency).toBe(1)
    expect(plan.runtimeMemoryProfile).toBe('low-memory')
  })

  it.each([
    ['mobile-balanced', 256, 2],
    ['desktop-fast', 1024, 3],
  ] as Array<[ExportExecutionProfileName, number, number]>)(
    'keeps non-iOS %s throughput defaults',
    (expectedProfile, expectedRows, expectedConcurrency) => {
      const plan = selectExportExecutionPlan({
        fidelity: expectedProfile === 'desktop-fast' ? 'max' : 'balanced',
        sourceWidth: 10000,
        sourceHeight: 9000,
        runtime: { lowMemoryAvailable: true, pthreadAvailable: true },
        output: { opfsAvailable: false, streamingAvailable: true },
        platform: {
          userAgent:
            expectedProfile === 'desktop-fast'
              ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/126 Safari/537.36'
              : 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
          touch: expectedProfile !== 'desktop-fast',
          hardwareConcurrency: 8,
        },
      })

      expect(plan.profile.name).toBe(expectedProfile)
      expect(plan.preferredRows).toBe(expectedRows)
      expect(plan.concurrency).toBe(expectedConcurrency)
    },
  )

  it('maps product copy without saying resume for safe retry', () => {
    expect(getExportModeCopy('interrupted-source-needed')).toBe(
      'The browser interrupted the previous export. Please reselect the same RAW file so LumaForge can retry with a safer setting.',
    )
    expect(getExportModeCopy('interrupted-source-needed')).not.toMatch(
      /resume/i,
    )
  })

  it('emits typed export debug events with machine-checkable payloads', () => {
    const events: unknown[] = []
    const listener = (event: Event) => {
      events.push((event as CustomEvent).detail)
    }

    window.addEventListener('lumaforge-export-debug', listener)
    try {
      emitExportDebugEvent({
        type: 'resource-evacuated',
        payload: {
          profile: 'ios-safe',
          requiredOwners: ['preview', 'bounded-hq', 'webgl', 'export-result'],
          disposedOwners: ['preview', 'bounded-hq', 'webgl', 'export-result'],
          registryCheck: { ok: true },
          remainingLive: [],
          estimatedBytesByOwner: { preview: 1024, webgl: 2048 },
          totalEstimatedBytes: 3072,
          evacuatedAt: '2026-05-03T00:00:00.000Z',
        },
      })
      emitExportDebugEvent({
        type: 'export-worker-attempt',
        payload: {
          attempt: 2,
          profile: 'ios-safe',
          preferredRows: 64,
          concurrency: 1,
          phase: 'retry-scheduled',
          retryReason: 'FULL_RES_EXPORT_RESOURCE_FAILURE',
          previousRows: 128,
          nextRows: 64,
          previousConcurrency: 1,
          nextConcurrency: 1,
          freshWorker: true,
          priorClientDisposed: true,
        },
      })
      emitExportDebugEvent({
        type: 'output-materialized',
        payload: {
          action: 'download',
          outputKind: 'file-backed',
          filename: 'frame_fullres.jpg',
          byteLength: 42,
          materializedAt: '2026-05-03T00:00:01.000Z',
          cleanup: 'scheduled',
        },
      })
    } finally {
      window.removeEventListener('lumaforge-export-debug', listener)
    }

    expect(events).toEqual([
      {
        type: 'resource-evacuated',
        payload: {
          profile: 'ios-safe',
          requiredOwners: ['preview', 'bounded-hq', 'webgl', 'export-result'],
          disposedOwners: ['preview', 'bounded-hq', 'webgl', 'export-result'],
          registryCheck: { ok: true },
          remainingLive: [],
          estimatedBytesByOwner: { preview: 1024, webgl: 2048 },
          totalEstimatedBytes: 3072,
          evacuatedAt: '2026-05-03T00:00:00.000Z',
        },
      },
      {
        type: 'export-worker-attempt',
        payload: {
          attempt: 2,
          profile: 'ios-safe',
          preferredRows: 64,
          concurrency: 1,
          phase: 'retry-scheduled',
          retryReason: 'FULL_RES_EXPORT_RESOURCE_FAILURE',
          previousRows: 128,
          nextRows: 64,
          previousConcurrency: 1,
          nextConcurrency: 1,
          freshWorker: true,
          priorClientDisposed: true,
        },
      },
      {
        type: 'output-materialized',
        payload: {
          action: 'download',
          outputKind: 'file-backed',
          filename: 'frame_fullres.jpg',
          byteLength: 42,
          materializedAt: '2026-05-03T00:00:01.000Z',
          cleanup: 'scheduled',
        },
      },
    ])
  })

  it('persists recent export debug events for post-reload Safari diagnostics', () => {
    clearExportDebugDiagnostics()

    emitExportDebugEvent({
      type: 'export-plan-selected',
      payload: {
        profile: 'ios-safe',
        preferredRows: 128,
        concurrency: 1,
        runtimeMemoryProfile: 'low-memory',
        outputSink: 'opfs-file',
        checkpointMode: 'safe-retry',
        checkpointDurableExpected: true,
      },
    })

    const stored = JSON.parse(
      localStorage.getItem(exportDebugEventStorageKey) ?? '[]',
    )

    expect(stored).toEqual([
      expect.objectContaining({
        recordedAt: expect.any(String),
        event: expect.objectContaining({
          type: 'export-plan-selected',
          payload: expect.objectContaining({
            profile: 'ios-safe',
            outputSink: 'opfs-file',
          }),
        }),
      }),
    ])
  })

  it('does not reread persisted diagnostics for every checkpoint event', () => {
    clearExportDebugDiagnostics()
    const getItem = vi.spyOn(Storage.prototype, 'getItem')

    for (
      let completedRowsForDiagnostics = 0;
      completedRowsForDiagnostics < 3;
      completedRowsForDiagnostics += 1
    ) {
      emitExportDebugEvent({
        type: 'checkpoint-written',
        payload: {
          exportId: 'export-1',
          completedRowsForDiagnostics,
          totalRows: 6374,
          updatedAt: `2026-05-20T08:30:0${completedRowsForDiagnostics}.000Z`,
        },
      })
    }

    expect(getItem).toHaveBeenCalledTimes(1)
  })

  it('throttles persisted checkpoint writes while keeping live checkpoint history', () => {
    clearExportDebugDiagnostics()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    for (const completedRowsForDiagnostics of [0, 128, 256, 1024, 2048, 6374]) {
      emitExportDebugEvent({
        type: 'checkpoint-written',
        payload: {
          exportId: 'export-1',
          completedRowsForDiagnostics,
          totalRows: 6374,
          updatedAt: `2026-05-20T08:30:${completedRowsForDiagnostics}.000Z`,
        },
      })
    }

    const liveHistory = (
      window as unknown as {
        __LUMAFORGE_EXPORT_DEBUG_HISTORY__?: unknown[]
      }
    ).__LUMAFORGE_EXPORT_DEBUG_HISTORY__
    const stored = JSON.parse(
      localStorage.getItem(exportDebugEventStorageKey) ?? '[]',
    )

    expect(setItem).toHaveBeenCalledTimes(4)
    expect(liveHistory).toHaveLength(6)
    expect(stored).toHaveLength(6)
    expect(stored.at(-1)).toMatchObject({
      event: {
        type: 'checkpoint-written',
        payload: {
          completedRowsForDiagnostics: 6374,
          totalRows: 6374,
        },
      },
    })
  })

  it('keeps export progress diagnostics live-only to avoid completion-path storage writes', () => {
    clearExportDebugDiagnostics()
    const events: unknown[] = []
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const listener = (event: Event) => {
      events.push((event as CustomEvent).detail)
    }

    window.addEventListener('lumaforge-export-debug', listener)
    try {
      emitExportDebugEvent({
        type: 'export-progress',
        payload: {
          completedStrips: 50,
          totalStrips: 50,
          progress: 99,
          recordedAt: '2026-05-20T10:03:49.472Z',
        },
      })
    } finally {
      window.removeEventListener('lumaforge-export-debug', listener)
    }

    expect(events).toEqual([
      {
        type: 'export-progress',
        payload: {
          completedStrips: 50,
          totalStrips: 50,
          progress: 99,
          recordedAt: '2026-05-20T10:03:49.472Z',
        },
      },
    ])
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.getItem(exportDebugEventStorageKey)).toBeNull()
  })
})
