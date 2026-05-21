import { describe, expect, it, vi } from 'vitest'

import type { LargeResourceOwner } from '~/lib/export/resource-registry'
import { createResourceRegistry } from '~/lib/export/resource-registry'

import type { ExportEvacuationError } from './export-evacuation'
import {
  createPreExportSnapshot,
  evacuateBeforeExport,
  getPreExportEvacuationOwners,
  toResourceCleanupDebugPayload,
  toResourceEvacuatedDebugPayload,
} from './export-evacuation'

const expectedFullEvacuationOwners: LargeResourceOwner[] = [
  'preview',
  'bounded-hq',
  'webgl',
  'export-result',
  'lut-fetch',
]

function fullEvacuationOwners() {
  return getPreExportEvacuationOwners('desktop-fast')
}

function snapshot() {
  return createPreExportSnapshot({
    file: new File(['raw'], 'frame.RAF', { lastModified: 123 }),
    metadata: { make: 'Fujifilm', model: 'GFX100RF' },
    graph: {
      supported: true,
      outputGamut: 'srgb-rec709',
      outputTransfer: 'srgb',
      lutProfile: null,
      steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
    },
    graphFingerprint: '[{"kind":"input-linear-prophoto"}]',
    lutTitle: 'V-Log',
    quickPreviewReady: true,
    tone: {
      userExposureEv: 0,
      userContrast: 0,
      userHighlights: 0,
      userShadows: 0,
      userWhites: 0,
      userBlacks: 0,
    },
    style: { kind: 'custom', name: 'V-Log' },
  })
}

describe('export evacuation', () => {
  it('uses the full evacuation owner set for every legacy metadata label', () => {
    expect(getPreExportEvacuationOwners('ios-safe')).toEqual(
      expectedFullEvacuationOwners,
    )
    expect(getPreExportEvacuationOwners('mobile-balanced')).toEqual(
      expectedFullEvacuationOwners,
    )
    expect(getPreExportEvacuationOwners('desktop-fast')).toEqual(
      expectedFullEvacuationOwners,
    )
  })

  it('runs the shared memory-efficient callbacks before export', async () => {
    const registry = createResourceRegistry()
    const events: string[] = []
    registry.register({
      id: 'webgl-pipeline',
      owner: 'webgl',
      kind: 'webgl-pipeline',
      dispose: () => {
        events.push('dispose-webgl-pipeline')
      },
    })
    registry.register({
      id: 'stale-result',
      owner: 'export-result',
      kind: 'blob',
      dispose: () => {
        events.push('dispose-stale-result')
      },
    })

    const result = await evacuateBeforeExport({
      registry,
      snapshot: snapshot(),
      owners: fullEvacuationOwners(),
      abortPreview: () => events.push('abort-preview'),
      abortBoundedHq: () => events.push('abort-bounded-hq'),
      releasePreviousExportResult: () => events.push('release-export-result'),
      stopLutFetches: () => events.push('stop-lut-fetches'),
    })

    expect(events).toEqual([
      'abort-preview',
      'abort-bounded-hq',
      'release-export-result',
      'stop-lut-fetches',
      'dispose-stale-result',
      'dispose-webgl-pipeline',
    ])
    expect(result.requiredOwners).toEqual([
      'preview',
      'bounded-hq',
      'webgl',
      'export-result',
      'lut-fetch',
    ])
    expect(result.disposedOwners).toEqual([
      'preview',
      'bounded-hq',
      'webgl',
      'export-result',
      'lut-fetch',
    ])
    expect(result.registryCheck).toEqual({ ok: true })
    expect(result.remainingLive).toEqual([])
    expect(result.estimatedBytesByOwner).toEqual({})
    expect(result.totalEstimatedBytes).toBe(0)
  })

  it('releases all low-memory owners before export', async () => {
    const registry = createResourceRegistry()
    const events: string[] = []
    registry.register({
      id: 'preview-worker',
      owner: 'preview',
      kind: 'worker',
      estimatedBytes: 1024,
      dispose: () => {
        events.push('dispose-preview-worker')
      },
    })
    registry.register({
      id: 'bounded-hq-buffer',
      owner: 'bounded-hq',
      kind: 'array-buffer',
      estimatedBytes: 2048,
      dispose: () => {
        events.push('dispose-bounded-hq-buffer')
      },
    })
    registry.register({
      id: 'webgl-pipeline',
      owner: 'webgl',
      kind: 'webgl-pipeline',
      estimatedBytes: 4096,
      dispose: () => {
        events.push('dispose-webgl-pipeline')
      },
    })

    const result = await evacuateBeforeExport({
      registry,
      snapshot: snapshot(),
      owners: fullEvacuationOwners(),
      abortPreview: () => events.push('abort-preview'),
      abortBoundedHq: () => events.push('abort-bounded-hq'),
      releasePreviousExportResult: () => events.push('release-export-result'),
      stopLutFetches: () => events.push('stop-lut-fetches'),
    })

    expect(events).toEqual([
      'abort-preview',
      'abort-bounded-hq',
      'release-export-result',
      'stop-lut-fetches',
      'dispose-bounded-hq-buffer',
      'dispose-preview-worker',
      'dispose-webgl-pipeline',
    ])
    expect(result.registryCheck).toEqual({ ok: true })
    expect(result.remainingLive).toEqual([])
    expect(result.estimatedBytesByOwner).toEqual({})
    expect(result.totalEstimatedBytes).toBe(0)
  })

  it('throws a stable evacuation error when owner disposal fails', async () => {
    const registry = createResourceRegistry()
    registry.register({
      id: 'stuck-webgl',
      owner: 'webgl',
      kind: 'webgl-pipeline',
      dispose: () => {
        throw new Error('dispose failed')
      },
    })

    await expect(
      evacuateBeforeExport({
        registry,
        snapshot: snapshot(),
        owners: fullEvacuationOwners(),
        abortPreview: vi.fn(),
        abortBoundedHq: vi.fn(),
        releasePreviousExportResult: vi.fn(),
        stopLutFetches: vi.fn(),
      }),
    ).rejects.toMatchObject({
      code: 'EXPORT_RESOURCE_EVICTION_INCOMPLETE',
    } satisfies Partial<ExportEvacuationError>)
  })

  it('serializes resource evacuation diagnostics without registry internals', () => {
    const payload = toResourceEvacuatedDebugPayload({
      profile: 'mobile-balanced',
      evacuation: {
        snapshot: snapshot(),
        registryCheck: {
          ok: false,
          live: [
            {
              id: 'webgl-pipeline',
              owner: 'webgl',
              kind: 'webgl-pipeline',
            },
          ],
        },
        requiredOwners: ['preview', 'webgl'],
        disposedOwners: ['preview'],
        remainingLive: [
          {
            id: 'webgl-pipeline',
            owner: 'webgl',
            kind: 'webgl-pipeline',
            estimatedBytes: 4096,
          },
        ],
        estimatedBytesByOwner: { webgl: 4096 },
        totalEstimatedBytes: 4096,
        evacuatedAt: '2026-05-04T00:00:00.000Z',
      },
    })

    expect(payload).toEqual({
      profile: 'mobile-balanced',
      requiredOwners: ['preview', 'webgl'],
      disposedOwners: ['preview'],
      registryCheck: {
        ok: false,
        live: [
          {
            id: 'webgl-pipeline',
            owner: 'webgl',
            kind: 'webgl-pipeline',
          },
        ],
      },
      remainingLive: [
        {
          id: 'webgl-pipeline',
          owner: 'webgl',
          kind: 'webgl-pipeline',
          estimatedBytes: 4096,
        },
      ],
      estimatedBytesByOwner: { webgl: 4096 },
      totalEstimatedBytes: 4096,
      evacuatedAt: '2026-05-04T00:00:00.000Z',
    })
  })

  it('serializes lifecycle cleanup diagnostics after export-result disposal', () => {
    const payload = toResourceCleanupDebugPayload({
      reason: 'reset-session',
      disposedOwners: ['export-result'],
      registryCheck: {
        ok: false,
        live: [
          {
            id: 'webgl-pipeline',
            owner: 'webgl',
            kind: 'webgl-pipeline',
          },
        ],
      },
      snapshot: {
        live: [
          {
            id: 'webgl-pipeline',
            owner: 'webgl',
            kind: 'webgl-pipeline',
            estimatedBytes: 4096,
          },
        ],
        liveByOwner: { webgl: 1 },
        estimatedBytesByOwner: { webgl: 4096 },
        totalEstimatedBytes: 4096,
      },
      cleanedAt: '2026-05-04T00:00:02.000Z',
    })

    expect(payload).toEqual({
      reason: 'reset-session',
      disposedOwners: ['export-result'],
      registryCheck: {
        ok: false,
        live: [
          {
            id: 'webgl-pipeline',
            owner: 'webgl',
            kind: 'webgl-pipeline',
          },
        ],
      },
      remainingLive: [
        {
          id: 'webgl-pipeline',
          owner: 'webgl',
          kind: 'webgl-pipeline',
          estimatedBytes: 4096,
        },
      ],
      estimatedBytesByOwner: { webgl: 4096 },
      totalEstimatedBytes: 4096,
      cleanedAt: '2026-05-04T00:00:02.000Z',
    })
  })
})
