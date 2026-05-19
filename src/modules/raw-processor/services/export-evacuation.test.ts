import { describe, expect, it, vi } from 'vitest'

import { createResourceRegistry } from '~/lib/export/resource-registry'

import type { ExportEvacuationError } from './export-evacuation'
import {
  createPreExportSnapshot,
  evacuateBeforeExport,
  getPreExportEvacuationOwners,
  toResourceEvacuatedDebugPayload,
} from './export-evacuation'

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
  it('selects full evacuation for low-memory profiles and result-only cleanup for desktop-fast', () => {
    expect(getPreExportEvacuationOwners('ios-safe')).toEqual([
      'preview',
      'bounded-hq',
      'webgl',
      'export-result',
      'lut-fetch',
    ])
    expect(getPreExportEvacuationOwners('mobile-balanced')).toEqual([
      'preview',
      'bounded-hq',
      'webgl',
      'export-result',
      'lut-fetch',
    ])
    expect(getPreExportEvacuationOwners('desktop-fast')).toEqual([
      'bounded-hq',
      'export-result',
    ])
  })

  it('runs only callbacks required by the selected owner set', async () => {
    const registry = createResourceRegistry()
    const events: string[] = []
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
      owners: getPreExportEvacuationOwners('desktop-fast'),
      abortPreview: () => events.push('abort-preview'),
      abortBoundedHq: () => events.push('abort-bounded-hq'),
      releasePreviousExportResult: () => events.push('release-export-result'),
      stopLutFetches: () => events.push('stop-lut-fetches'),
    })

    expect(events).toEqual([
      'abort-bounded-hq',
      'release-export-result',
      'dispose-stale-result',
    ])
    expect(result.requiredOwners).toEqual(['bounded-hq', 'export-result'])
    expect(result.disposedOwners).toEqual(['bounded-hq', 'export-result'])
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
      owners: getPreExportEvacuationOwners('ios-safe'),
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
        owners: getPreExportEvacuationOwners('ios-safe'),
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
})
