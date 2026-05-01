import { describe, expect, it, vi } from 'vitest'

import { createResourceRegistry } from '~/lib/export/resource-registry'

import {
  createPreExportSnapshot,
  evacuateBeforeExport,
} from './export-evacuation'

describe('export evacuation', () => {
  it('keeps a lightweight snapshot and releases preview owners before export', async () => {
    const registry = createResourceRegistry()
    const events: string[] = []
    const file = new File(['raw'], 'frame.RAF', { lastModified: 123 })
    const snapshot = createPreExportSnapshot({
      file,
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
      tone: { userExposureEv: 0, userContrast: 0 },
      style: { kind: 'custom', name: 'V-Log' },
    })

    registry.register({
      id: 'preview-worker',
      owner: 'preview',
      kind: 'worker',
      dispose: () => {
        events.push('dispose-preview-worker')
      },
    })
    registry.register({
      id: 'bounded-hq-buffer',
      owner: 'bounded-hq',
      kind: 'array-buffer',
      dispose: () => {
        events.push('dispose-bounded-hq-buffer')
      },
    })
    registry.register({
      id: 'webgl-pipeline',
      owner: 'webgl',
      kind: 'webgl-pipeline',
      dispose: () => {
        events.push('dispose-webgl-pipeline')
      },
    })

    const result = await evacuateBeforeExport({
      registry,
      snapshot,
      abortPreview: () => events.push('abort-preview'),
      abortBoundedHq: () => events.push('abort-bounded-hq'),
      releasePreviousExportResult: () => events.push('release-export-result'),
    })

    expect(events).toEqual([
      'abort-preview',
      'abort-bounded-hq',
      'release-export-result',
      'dispose-bounded-hq-buffer',
      'dispose-preview-worker',
      'dispose-webgl-pipeline',
    ])
    expect(result.registryCheck).toEqual({ ok: true })
    expect(result.snapshot).toEqual(snapshot)
    expect(result.snapshot.file).toBe(file)
    expect(result.snapshot.quickPreviewReady).toBe(true)
    expect(result.snapshot.metadata).toEqual({
      make: 'Fujifilm',
      model: 'GFX100RF',
    })
    expect(result.snapshot.tone).toEqual({
      userExposureEv: 0,
      userContrast: 0,
    })
    expect(result.evacuatedAt).toEqual(expect.any(String))
  })

  it('returns a failed registry check when a disposable owner remains live', async () => {
    const registry = {
      disposeOwners: vi.fn(),
      assertZeroLive: vi.fn(() => ({
        ok: false as const,
        live: [
          {
            id: 'stuck-preview',
            owner: 'preview' as const,
            kind: 'worker' as const,
          },
        ],
      })),
    }
    const snapshot = createPreExportSnapshot({
      file: new File(['raw'], 'frame.RAF'),
      metadata: null,
      graphFingerprint: 'graph',
      quickPreviewReady: false,
      tone: null,
      style: null,
    })

    const result = await evacuateBeforeExport({
      registry: registry as never,
      snapshot,
      abortPreview: vi.fn(),
      abortBoundedHq: vi.fn(),
      releasePreviousExportResult: vi.fn(),
    })

    expect(registry.disposeOwners).toHaveBeenCalledWith([
      'preview',
      'bounded-hq',
      'webgl',
      'export-result',
      'lut-fetch',
    ])
    expect(result.registryCheck).toEqual({
      ok: false,
      live: [{ id: 'stuck-preview', owner: 'preview', kind: 'worker' }],
    })
  })
})
