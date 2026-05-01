import type { ExportColorGraphDescriptor } from '@lumaforge/luma-color-runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBlobOutputResult } from '~/lib/export/output-sink'

import {
  buildExportFilename,
  getConcurrencyForFidelity,
  getPreferredRowsForFidelity,
  recommendRetryLevel,
  runFullResolutionExportJob,
  selectCurrentExportExecutionPlan,
} from '../services/export-system'

describe('export-system', () => {
  beforeEach(() => {
    vi.stubGlobal('crossOriginIsolated', true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  it('maps fidelity levels to profile-backed preferred row budgets', () => {
    expect(getPreferredRowsForFidelity('safe')).toBe(256)
    expect(getPreferredRowsForFidelity('balanced')).toBe(1024)
    expect(getPreferredRowsForFidelity('max')).toBe(1024)
  })

  it('maps fidelity levels to bounded pipeline concurrency', () => {
    expect(getConcurrencyForFidelity('safe')).toBe(1)
    expect(getConcurrencyForFidelity('balanced')).toBe(2)
    expect(getConcurrencyForFidelity('max')).toBe(3)
  })

  it('keeps legacy fidelity helper budgets independent of ambient isolation globals', () => {
    vi.unstubAllGlobals()

    expect(getPreferredRowsForFidelity('max')).toBe(1024)
    expect(getConcurrencyForFidelity('max')).toBe(3)
  })

  it('selects ios-safe rows for 100MP current-session safe export', () => {
    const plan = selectCurrentExportExecutionPlan({
      fidelity: 'safe',
      sourceWidth: 11662,
      sourceHeight: 8746,
    })

    expect(plan.preferredRows).toBeLessThanOrEqual(128)
    expect(plan.concurrency).toBe(1)
    expect(plan.checkpointMode).toBe('safe-retry')
  })

  it('runs the full-resolution export client and disposes it', async () => {
    const file = new File(['raw'], 'frame.ARW')
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' })
    const output = createBlobOutputResult({
      filename: 'frame_neutral_fullres.jpg',
      blob,
    })
    const run = vi.fn().mockResolvedValue(output)
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
      output,
      attempts: 1,
    })
  })

  it('passes execution plan to the worker client and returns attempt count', async () => {
    const file = new File(['raw'], 'frame.ARW')
    const output = createBlobOutputResult({
      filename: 'frame_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })
    const run = vi.fn().mockResolvedValue(output)
    const dispose = vi.fn()
    const graph: ExportColorGraphDescriptor = {
      supported: true,
      outputGamut: 'srgb-rec709',
      outputTransfer: 'srgb',
      lutProfile: null,
      steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
    }
    const executionPlan = selectCurrentExportExecutionPlan({
      fidelity: 'safe',
      sourceWidth: 11662,
      sourceHeight: 8746,
    })

    const result = await runFullResolutionExportJob({
      file,
      filename: 'frame_neutral_fullres.jpg',
      graph,
      executionPlan,
      clientFactory: () =>
        ({
          run,
          dispose,
        }) as never,
    })

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        executionPlan: {
          profileName: executionPlan.profile.name,
          preferredRows: executionPlan.preferredRows,
          concurrency: executionPlan.concurrency,
          runtimeMemoryProfile: executionPlan.runtimeMemoryProfile,
          outputSink: executionPlan.outputSink,
          checkpointMode: executionPlan.checkpointMode,
        },
      }),
    )
    expect(result).toEqual({
      filename: 'frame_neutral_fullres.jpg',
      output,
      attempts: 1,
    })
  })

  it('retries fresh workers for resource failures and disposes each client once', async () => {
    const file = new File(['raw'], 'frame.ARW')
    const output = createBlobOutputResult({
      filename: 'frame_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })
    const graph: ExportColorGraphDescriptor = {
      supported: true,
      outputGamut: 'srgb-rec709',
      outputTransfer: 'srgb',
      lutProfile: null,
      steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
    }
    const executionPlan = selectCurrentExportExecutionPlan({
      fidelity: 'safe',
      sourceWidth: 11662,
      sourceHeight: 8746,
    })
    const first = {
      run: vi
        .fn()
        .mockRejectedValue(new Error('FULL_RES_EXPORT_RESOURCE_FAILURE')),
      dispose: vi.fn(),
    }
    const second = {
      run: vi.fn().mockResolvedValue(output),
      dispose: vi.fn(),
    }
    const clientFactory = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)

    const result = await runFullResolutionExportJob({
      file,
      filename: 'frame_neutral_fullres.jpg',
      graph,
      executionPlan,
      clientFactory: clientFactory as never,
    })

    expect(clientFactory).toHaveBeenCalledTimes(2)
    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(second.dispose).toHaveBeenCalledTimes(1)
    expect(second.run).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredRows: Math.max(
          executionPlan.profile.minRows,
          Math.floor(executionPlan.preferredRows / 2),
        ),
        concurrency: 1,
      }),
    )
    expect(result).toEqual({
      filename: 'frame_neutral_fullres.jpg',
      output,
      attempts: 2,
    })
  })
})
