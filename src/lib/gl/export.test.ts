import { describe, expect, it } from 'vitest'

import { planExportRenderTarget } from './export'

describe('export render target planner', () => {
  it('uses a full-frame render when GPU and canvas limits can hold the image', () => {
    expect(
      planExportRenderTarget({
        width: 4000,
        height: 3000,
        maxTextureSize: 8192,
        maxCanvasSize: 16384,
        maxCanvasPixels: 120_000_000,
        memoryBudgetBytes: 768 * 1024 * 1024,
      }),
    ).toEqual({
      strategy: 'full-frame',
      width: 4000,
      height: 3000,
    })
  })

  it('tiles when the export fits canvas limits but exceeds full-frame GPU texture size', () => {
    const plan = planExportRenderTarget({
      width: 9000,
      height: 6000,
      maxTextureSize: 4096,
      maxCanvasSize: 16384,
      maxCanvasPixels: 120_000_000,
      memoryBudgetBytes: 768 * 1024 * 1024,
    })

    expect(plan).toMatchObject({
      strategy: 'tiled',
      width: 9000,
      height: 6000,
      reason: 'texture-limit',
      tileWidth: 4096,
      tileHeight: 4096,
    })
  })

  it('tiles when a full-frame render exceeds the practical memory budget', () => {
    const plan = planExportRenderTarget({
      width: 7000,
      height: 5000,
      maxTextureSize: 8192,
      maxCanvasSize: 16384,
      maxCanvasPixels: 120_000_000,
      memoryBudgetBytes: 256 * 1024 * 1024,
    })

    expect(plan).toMatchObject({
      strategy: 'tiled',
      width: 7000,
      height: 5000,
      reason: 'memory-budget',
    })
    expect(plan.strategy === 'tiled' ? plan.tileWidth : 0).toBeLessThan(7000)
  })

  it('fails closed when the output canvas itself cannot hold the export', () => {
    expect(
      planExportRenderTarget({
        width: 20000,
        height: 12000,
        maxTextureSize: 8192,
        maxCanvasSize: 16384,
        maxCanvasPixels: 120_000_000,
        memoryBudgetBytes: 768 * 1024 * 1024,
      }),
    ).toEqual({
      strategy: 'fail',
      width: 20000,
      height: 12000,
      reason: 'canvas-limit',
      retryable: true,
    })
  })

  it('fails closed when no viable tile can fit the GPU budget', () => {
    expect(
      planExportRenderTarget({
        width: 1024,
        height: 1024,
        maxTextureSize: 0,
        maxCanvasSize: 16384,
        maxCanvasPixels: 120_000_000,
        memoryBudgetBytes: 768 * 1024 * 1024,
      }),
    ).toEqual({
      strategy: 'fail',
      width: 1024,
      height: 1024,
      reason: 'gpu-limit',
      retryable: false,
    })
  })
})
