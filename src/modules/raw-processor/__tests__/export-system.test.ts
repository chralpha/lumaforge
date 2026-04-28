import { describe, expect, it, vi } from 'vitest'

import type { ExportColorGraphDescriptor } from '~/lib/export/color-graph'

import {
  buildExportFilename,
  getConcurrencyForFidelity,
  getPreferredRowsForFidelity,
  recommendRetryLevel,
  runFullResolutionExportJob,
} from '../services/export-system'

describe('export-system', () => {
  it('generates filenames for builtin and custom styles', () => {
    expect(buildExportFilename('frame.ARW', 'Neutral')).toBe(
      'frame_Neutral_fullres.jpg',
    )
    expect(buildExportFilename('frame.ARW', 'custom')).toBe(
      'frame_custom_fullres.jpg',
    )
  })

  it('recommends the next lower fidelity level on failure', () => {
    expect(recommendRetryLevel('max')).toBe('balanced')
    expect(recommendRetryLevel('balanced')).toBe('safe')
    expect(recommendRetryLevel('safe')).toBe(null)
  })

  it('maps fidelity levels to monotonic preferred row budgets', () => {
    expect(getPreferredRowsForFidelity('safe')).toBeLessThan(
      getPreferredRowsForFidelity('balanced'),
    )
    expect(getPreferredRowsForFidelity('balanced')).toBeLessThan(
      getPreferredRowsForFidelity('max'),
    )
  })

  it('maps fidelity levels to bounded pipeline concurrency', () => {
    expect(getConcurrencyForFidelity('safe')).toBe(1)
    expect(getConcurrencyForFidelity('balanced')).toBe(2)
    expect(getConcurrencyForFidelity('max')).toBe(3)
  })

  it('runs the full-resolution export client and disposes it', async () => {
    const file = new File(['raw'], 'frame.ARW')
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' })
    const run = vi.fn().mockResolvedValue(blob)
    const dispose = vi.fn()
    const controller = new AbortController()
    const graph: ExportColorGraphDescriptor = {
      supported: true,
      outputGamut: 'srgb-rec709',
      outputTransfer: 'srgb',
      lutProfile: null,
      steps: [
        { kind: 'input-linear-prophoto' },
        { kind: 'raw-render-exposure', ev: 0, multiplier: 1 },
        { kind: 'output-srgb' },
      ],
    }

    const result = await runFullResolutionExportJob({
      file,
      filename: 'frame_neutral_fullres.jpg',
      graph,
      quality: 0.92,
      preferredRows: 1024,
      concurrency: 3,
      signal: controller.signal,
      clientFactory: () =>
        ({
          run,
          dispose,
        }) as never,
    })

    expect(run).toHaveBeenCalledTimes(1)
    const exportRequest = run.mock.calls[0]![0]

    expect(exportRequest.graph.steps).toContainEqual({
      kind: 'raw-render-exposure',
      ev: 0,
      multiplier: 1,
    })
    expect(run).toHaveBeenCalledWith({
      file,
      graph,
      onProgress: undefined,
      preferredRows: 1024,
      concurrency: 3,
      quality: 0.92,
      signal: controller.signal,
    })
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      filename: 'frame_neutral_fullres.jpg',
      blob,
    })
  })
})
