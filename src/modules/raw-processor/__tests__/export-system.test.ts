import { describe, expect, it, vi } from 'vitest'

import {
  buildExportFilename,
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

  it('runs the full-resolution export client and disposes it', async () => {
    const file = new File(['raw'], 'frame.ARW')
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' })
    const run = vi.fn().mockResolvedValue(blob)
    const dispose = vi.fn()
    const controller = new AbortController()

    const result = await runFullResolutionExportJob({
      file,
      filename: 'frame_neutral_fullres.jpg',
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
      },
      quality: 0.92,
      signal: controller.signal,
      clientFactory: () =>
        ({
          run,
          dispose,
        }) as never,
    })

    expect(run).toHaveBeenCalledWith({
      file,
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
      },
      onProgress: undefined,
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
