import { createLumaRawRuntime } from '@lumaforge/luma-raw-runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { runFullResolutionJpegExport } from './full-res-export'
import { runProcessedWindowExportLifecycle } from './full-res-export.worker'
import type { FullResExportWorkerResponse } from './full-res-export-client'
import {
  createBlobOutputResult,
  createMemoryFileBackedOutputResult,
  materializeOutputBlob,
} from './output-sink'

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
  it('uses execution plan runtime profile and emits checkpoint metrics', async () => {
    const responses: FullResExportWorkerResponse[] = []
    vi.spyOn(self, 'postMessage').mockImplementation((message) => {
      responses.push(message as FullResExportWorkerResponse)
    })
    const session = {
      probe: {
        width: 4,
        height: 4,
        supportLevel: 'full',
        timings: { total: 1 },
      },
      probeExportCapability: vi.fn(async () => ({
        supported: true,
        width: 4,
        height: 4,
      })),
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
    vi.mocked(runFullResolutionJpegExport).mockImplementation(async (input) => {
      await input.onCheckpoint?.({
        completedRowsForDiagnostics: 64,
        totalRows: 128,
        stripRows: 64,
      })
      return createBlobOutputResult({
        filename: 'sample.jpg',
        blob: makeJfifOnlyJpeg(),
      })
    })

    self.onmessage?.({
      data: {
        kind: 'start',
        requestId: 'request-low-memory',
        file: new File(['raw'], 'sample.RAF'),
        graph: {
          supported: true,
          outputGamut: 'srgb-rec709',
          outputTransfer: 'srgb',
          lutProfile: null,
          steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
        },
        executionPlan: {
          profileName: 'desktop-fast',
          preferredRows: 64,
          concurrency: 1,
          runtimeMemoryProfile: 'low-memory',
          outputSink: 'opfs-file',
          checkpointMode: 'safe-retry',
        },
        checkpoint: {
          exportId: 'export-1',
          graphFingerprint: 'graph-1',
          sourceFingerprint: {
            name: 'sample.RAF',
            size: 3,
            lastModified: 0,
            hashPrefixHex: 'abc',
          },
        },
        quality: 0.9,
        collectMetrics: false,
      },
    } as MessageEvent)

    await vi.waitFor(() => {
      expect(responses.some((response) => response.kind === 'success')).toBe(
        true,
      )
    })

    expect(createLumaRawRuntime).toHaveBeenCalledWith({
      memoryProfile: 'low-memory',
      requireCrossOriginIsolation: false,
    })
    expect(runFullResolutionJpegExport).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredRows: 64,
        concurrency: 1,
        quality: 0.9,
        jpegSink: expect.any(Object),
        retryPolicy: 'surface-resource-failure',
        onCheckpoint: expect.any(Function),
      }),
    )
    expect(responses).toContainEqual(
      expect.objectContaining({
        kind: 'metric',
        requestId: 'request-low-memory',
        metric: expect.objectContaining({
          kind: 'checkpoint',
          requestId: 'request-low-memory',
          completedRowsForDiagnostics: 64,
          totalRows: 128,
          stripRows: 64,
        }),
      }),
    )
  })

  it('returns file-backed worker results without materializing them', async () => {
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
        width: 4,
        height: 4,
        supportLevel: 'full',
        timings: { total: 1 },
      },
      probeExportCapability: vi.fn(async () => ({
        supported: true,
        width: 4,
        height: 4,
      })),
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
    const output = createMemoryFileBackedOutputResult({
      exportId: 'export-1',
      filename: 'safe-output.jpg',
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([1, 2, 3]),
    })
    const openBlob = vi.spyOn(output, 'openBlob')
    vi.mocked(createLumaRawRuntime).mockReturnValue(runtime as never)
    vi.mocked(runFullResolutionJpegExport).mockResolvedValue(output)

    self.onmessage?.({
      data: {
        kind: 'start',
        requestId: 'request-file-backed',
        file: new File(['raw'], 'sample.RAF'),
        filename: 'safe-output.jpg',
        graph: {
          supported: true,
          outputGamut: 'srgb-rec709',
          outputTransfer: 'srgb',
          lutProfile: null,
          steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
        },
        executionPlan: {
          profileName: 'ios-safe',
          preferredRows: 64,
          concurrency: 1,
          runtimeMemoryProfile: 'low-memory',
          outputSink: 'opfs-file',
          checkpointMode: 'safe-retry',
        },
        checkpoint: {
          exportId: 'export-1',
          graphFingerprint: 'graph-1',
          sourceFingerprint: {
            name: 'sample.RAF',
            size: 3,
            lastModified: 0,
            hashPrefixHex: 'abc',
          },
        },
        collectMetrics: false,
      },
    } as MessageEvent)

    const response = await terminalResponse

    expect(openBlob).not.toHaveBeenCalled()
    expect(response).toMatchObject({
      kind: 'success',
      requestId: 'request-file-backed',
      result: {
        kind: 'file-backed',
        storage: 'opfs',
        exportId: 'export-1',
        filename: 'safe-output.jpg',
        byteLength: 3,
        mimeType: 'image/jpeg',
      },
    })
  })

  it('releases the RAW runtime before posting a file-backed success response', async () => {
    const order: string[] = []
    const terminalResponse = new Promise<FullResExportWorkerResponse>(
      (resolve) => {
        vi.spyOn(self, 'postMessage').mockImplementation((message) => {
          const response = message as FullResExportWorkerResponse
          if (response.kind === 'success' || response.kind === 'error') {
            order.push(response.kind)
            resolve(response)
          }
        })
      },
    )
    const session = {
      probe: {
        width: 4,
        height: 4,
        supportLevel: 'full',
        timings: { total: 1 },
      },
      probeExportCapability: vi.fn(async () => ({
        supported: true,
        width: 4,
        height: 4,
      })),
      readProcessedWindow: vi.fn(),
      beginProcessedWindowExport: vi.fn(async () => undefined),
      endProcessedWindowExport: vi.fn(async () => undefined),
      dispose: vi.fn(() => {
        order.push('session.dispose')
      }),
    }
    const runtime = {
      init: vi.fn(async () => undefined),
      openSession: vi.fn(async () => session),
      dispose: vi.fn(() => {
        order.push('runtime.dispose')
      }),
    }
    vi.mocked(createLumaRawRuntime).mockReturnValue(runtime as never)
    vi.mocked(runFullResolutionJpegExport).mockResolvedValue(
      createMemoryFileBackedOutputResult({
        exportId: 'export-1',
        filename: 'safe-output.jpg',
        mimeType: 'image/jpeg',
        bytes: new Uint8Array([1, 2, 3]),
      }),
    )

    self.onmessage?.({
      data: {
        kind: 'start',
        requestId: 'request-file-backed-release',
        file: new File(['raw'], 'sample.RAF'),
        filename: 'safe-output.jpg',
        graph: {
          supported: true,
          outputGamut: 'srgb-rec709',
          outputTransfer: 'srgb',
          lutProfile: null,
          steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
        },
        executionPlan: {
          profileName: 'ios-safe',
          preferredRows: 64,
          concurrency: 1,
          runtimeMemoryProfile: 'low-memory',
          outputSink: 'opfs-file',
          checkpointMode: 'safe-retry',
        },
        checkpoint: {
          exportId: 'export-1',
          graphFingerprint: 'graph-1',
          sourceFingerprint: {
            name: 'sample.RAF',
            size: 3,
            lastModified: 0,
            hashPrefixHex: 'abc',
          },
        },
        collectMetrics: false,
      },
    } as MessageEvent)

    await expect(terminalResponse).resolves.toMatchObject({ kind: 'success' })
    expect(order).toEqual(['session.dispose', 'runtime.dispose', 'success'])
    expect(session.dispose).toHaveBeenCalledTimes(1)
    expect(runtime.dispose).toHaveBeenCalledTimes(1)
  })

  it('includes next row hints when worker resource retry fails', async () => {
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
    vi.mocked(runFullResolutionJpegExport).mockRejectedValue(
      Object.assign(new Error('FULL_RES_EXPORT_RESOURCE_FAILURE'), {
        nextRows: 96,
      }),
    )

    self.onmessage?.({
      data: {
        kind: 'start',
        requestId: 'request-resource-failure',
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
      requestId: 'request-resource-failure',
      message: 'FULL_RES_EXPORT_RESOURCE_FAILURE',
      nextRows: 96,
    })
  })

  it('keeps desktop runtime cross-origin isolation requirement by default', async () => {
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
        width: 4,
        height: 4,
        supportLevel: 'full',
        timings: { total: 1 },
      },
      probeExportCapability: vi.fn(async () => ({
        supported: true,
        width: 4,
        height: 4,
      })),
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
        filename: 'sample.jpg',
        blob: makeJfifOnlyJpeg(),
      }),
    )

    self.onmessage?.({
      data: {
        kind: 'start',
        requestId: 'request-desktop',
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

    await expect(terminalResponse).resolves.toMatchObject({ kind: 'success' })
    expect(createLumaRawRuntime).toHaveBeenCalledWith({
      memoryProfile: 'desktop',
      requireCrossOriginIsolation: true,
    })
    expect(runFullResolutionJpegExport).toHaveBeenCalledWith(
      expect.objectContaining({
        retryPolicy: 'in-process',
        onCheckpoint: undefined,
      }),
    )
  })

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

    if (response.result.kind !== 'blob') {
      throw new Error('Expected metadata test to return a blob result.')
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
