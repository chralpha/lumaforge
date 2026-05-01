import { createLumaRawRuntime } from '@lumaforge/luma-raw-runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { runFullResolutionJpegExport } from './full-res-export'
import { runProcessedWindowExportLifecycle } from './full-res-export.worker'
import type { FullResExportWorkerResponse } from './full-res-export-client'
import { createBlobOutputResult, materializeOutputBlob } from './output-sink'

vi.mock('@lumaforge/luma-raw-runtime', () => ({
  createLumaRawRuntime: vi.fn(),
}))

vi.mock('./full-res-export', () => ({
  runFullResolutionJpegExport: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

function makeJfifOnlyJpeg() {
  return new Blob(
    [
      new Uint8Array([
        255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
        255, 217,
      ]),
    ],
    { type: 'image/jpeg' },
  )
}

function bytesIncludeAscii(bytes: Uint8Array, value: string) {
  const needle = Array.from(value, (character) => character.charCodeAt(0))

  return bytes.some((_byte, index) =>
    needle.every(
      (needleByte, needleIndex) => bytes[index + needleIndex] === needleByte,
    ),
  )
}

function readBlobBytes(blob: Blob) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result))
        return
      }

      reject(new Error('Expected Blob to read as an ArrayBuffer.'))
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read Blob bytes.'))
    reader.readAsArrayBuffer(blob)
  })
}

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
  it('writes EXIF metadata into the successful JPEG response', async () => {
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
      probe: {
        jobId: 'raw-job-1',
        make: 'Sony',
        model: 'ILCE-7RM5',
        lens: 'FE 50mm F1.4 GM',
        iso: 125,
        aperture: 1.4,
        focalLength: 50,
        shutter: 0.005,
        timestamp: 1_704_067_200,
        width: 9504,
        height: 6336,
        supportLevel: 'experimental',
        timings: { total: 1 },
      },
      probeExportCapability: vi.fn(async () => ({
        supported: true,
        width: 9504,
        height: 6336,
      })),
      readRawWindow: vi.fn(),
      readProcessedWindow: vi.fn(),
      beginProcessedWindowExport: vi.fn(async () => undefined),
      endProcessedWindowExport: vi.fn(async () => undefined),
      dispose: vi.fn(),
    }
    const runtime = {
      init: vi.fn(async () => undefined),
      openSession: vi.fn(async () => session),
      dispose: vi.fn(),
    }
    vi.mocked(createLumaRawRuntime).mockReturnValue(runtime as never)
    vi.mocked(runFullResolutionJpegExport).mockResolvedValue(
      createBlobOutputResult({
        filename: 'sony.jpg',
        blob: makeJfifOnlyJpeg(),
      }),
    )

    self.onmessage?.({
      data: {
        kind: 'start',
        requestId: 'request-with-metadata',
        file: new File(['raw'], 'sony.ARW'),
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

    const response = await terminalResponse
    expect(response.kind).toBe('success')
    if (response.kind !== 'success') {
      throw new Error('Expected a successful export response.')
    }

    const bytes = await readBlobBytes(
      await materializeOutputBlob(response.result),
    )
    expect(bytesIncludeAscii(bytes, 'Exif\0\0')).toBe(true)
    expect(bytesIncludeAscii(bytes, 'Sony')).toBe(true)
    expect(bytesIncludeAscii(bytes, 'ILCE-7RM5')).toBe(true)
    expect(bytesIncludeAscii(bytes, 'FE 50mm F1.4 GM')).toBe(true)
  })

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
      createBlobOutputResult({
        filename: 'sample.jpg',
        blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      }),
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
