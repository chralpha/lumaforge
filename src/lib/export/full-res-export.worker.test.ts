import { createLumaRawRuntime } from '@lumaforge/luma-raw-runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { runFullResolutionJpegExport } from './full-res-export'
import { runProcessedWindowExportLifecycle } from './full-res-export.worker'
import type { FullResExportWorkerResponse } from './full-res-export-client'

vi.mock('@lumaforge/luma-raw-runtime', () => ({
  createLumaRawRuntime: vi.fn(),
}))

vi.mock('./full-res-export', () => ({
  runFullResolutionJpegExport: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runProcessedWindowExportLifecycle', () => {
  it('runs begin, export, and end before returning the export result', async () => {
    const order: string[] = []
    const beginProcessedWindowExport = vi.fn(async () => {
      order.push('begin')
    })
    const runExport = vi.fn(async () => {
      order.push('export')
      return new Blob(['jpeg'], { type: 'image/jpeg' })
    })
    const endProcessedWindowExport = vi.fn(async () => {
      order.push('end')
    })

    await expect(
      runProcessedWindowExportLifecycle({
        beginProcessedWindowExport,
        endProcessedWindowExport,
        runExport,
      }),
    ).resolves.toMatchObject({ type: 'image/jpeg' })

    expect(order).toEqual(['begin', 'export', 'end'])
  })

  it('runs end and preserves the original export error when export fails', async () => {
    const exportError = new Error('EXPORT_FAILED')
    const beginProcessedWindowExport = vi.fn(async () => undefined)
    const runExport = vi.fn(async () => {
      throw exportError
    })
    const endProcessedWindowExport = vi.fn(async () => undefined)

    await expect(
      runProcessedWindowExportLifecycle({
        beginProcessedWindowExport,
        endProcessedWindowExport,
        runExport,
      }),
    ).rejects.toBe(exportError)
    expect(endProcessedWindowExport).toHaveBeenCalledTimes(1)
  })

  it('runs end without the aborted export signal after cancellation happens after begin', async () => {
    const controller = new AbortController()
    const beginProcessedWindowExport = vi.fn(async () => undefined)
    const runExport = vi.fn(async () => {
      controller.abort()
      throw new Error('FULL_RES_EXPORT_CANCELLED')
    })
    const endProcessedWindowExport = vi.fn(async () => undefined)

    await expect(
      runProcessedWindowExportLifecycle({
        beginProcessedWindowExport,
        endProcessedWindowExport,
        runExport,
        signal: controller.signal,
      }),
    ).rejects.toThrow('FULL_RES_EXPORT_CANCELLED')
    expect(endProcessedWindowExport).toHaveBeenCalledWith()
  })

  it('runs export without end when begin is unavailable', async () => {
    const runExport = vi.fn(async () => 'exported')
    const endProcessedWindowExport = vi.fn(async () => undefined)

    await expect(
      runProcessedWindowExportLifecycle({
        endProcessedWindowExport,
        runExport,
      }),
    ).resolves.toBe('exported')
    expect(runExport).toHaveBeenCalledTimes(1)
    expect(endProcessedWindowExport).not.toHaveBeenCalled()
  })

  it('does not run export or end when begin throws', async () => {
    const beginError = new Error('BEGIN_FAILED')
    const beginProcessedWindowExport = vi.fn(async () => {
      throw beginError
    })
    const runExport = vi.fn(async () => 'exported')
    const endProcessedWindowExport = vi.fn(async () => undefined)

    await expect(
      runProcessedWindowExportLifecycle({
        beginProcessedWindowExport,
        endProcessedWindowExport,
        runExport,
      }),
    ).rejects.toBe(beginError)
    expect(runExport).not.toHaveBeenCalled()
    expect(endProcessedWindowExport).not.toHaveBeenCalled()
  })

  it('preserves the original export error when end also throws', async () => {
    const exportError = new Error('EXPORT_FAILED')
    const cleanupError = new Error('END_FAILED')
    const beginProcessedWindowExport = vi.fn(async () => undefined)
    const runExport = vi.fn(async () => {
      throw exportError
    })
    const endProcessedWindowExport = vi.fn(async () => {
      throw cleanupError
    })

    await expect(
      runProcessedWindowExportLifecycle({
        beginProcessedWindowExport,
        endProcessedWindowExport,
        runExport,
      }),
    ).rejects.toBe(exportError)
  })

  it('fails before returning success when end throws after a successful export', async () => {
    const cleanupError = new Error('END_FAILED')
    const beginProcessedWindowExport = vi.fn(async () => undefined)
    const runExport = vi.fn(async () => 'exported')
    const endProcessedWindowExport = vi.fn(async () => {
      throw cleanupError
    })

    await expect(
      runProcessedWindowExportLifecycle({
        beginProcessedWindowExport,
        endProcessedWindowExport,
        runExport,
      }),
    ).rejects.toBe(cleanupError)
  })
})

describe('full-resolution export worker lifecycle responses', () => {
  it('posts one error and no success when end fails after a successful export', async () => {
    const terminalResponse = new Promise<FullResExportWorkerResponse>(
      (resolve) => {
        vi.spyOn(self, 'postMessage').mockImplementation((message) => {
          const response = message as FullResExportWorkerResponse
          if (response.kind === 'success' || response.kind === 'error') {
            resolve(response)
          }
        })
      },
    )
    const session = {
      probeExportCapability: vi.fn(async () => ({
        supported: true,
        width: 1,
        height: 1,
      })),
      readRawWindow: vi.fn(),
      readProcessedWindow: vi.fn(),
      beginProcessedWindowExport: vi.fn(async () => undefined),
      endProcessedWindowExport: vi.fn(async () => {
        throw new Error('END_FAILED')
      }),
      dispose: vi.fn(),
    }
    const runtime = {
      init: vi.fn(async () => undefined),
      openSession: vi.fn(async () => session),
      dispose: vi.fn(),
    }
    vi.mocked(createLumaRawRuntime).mockReturnValue(runtime as never)
    vi.mocked(runFullResolutionJpegExport).mockResolvedValue(
      new Blob(['jpeg'], { type: 'image/jpeg' }),
    )

    self.onmessage?.({
      data: {
        kind: 'start',
        requestId: 'request-1',
        file: new File(['raw'], 'sample.RAF'),
        graph: {
          supported: true,
          outputGamut: 'srgb-rec709',
          outputTransfer: 'srgb',
          lutProfile: null,
          steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
        },
        collectMetrics: false,
      },
    } as MessageEvent)

    await expect(terminalResponse).resolves.toEqual({
      kind: 'error',
      requestId: 'request-1',
      message: 'END_FAILED',
    })
    expect(self.postMessage).toHaveBeenCalledTimes(1)
    expect(session.dispose).toHaveBeenCalledTimes(1)
    expect(runtime.dispose).toHaveBeenCalledTimes(1)
  })
})
