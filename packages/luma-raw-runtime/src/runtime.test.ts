import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLumaRawRuntime } from './runtime'
import type {
  LumaRawWorkerRequest,
  LumaRawWorkerResponse,
} from './worker-protocol'

class RecordingWorker {
  onmessage: ((event: MessageEvent<LumaRawWorkerResponse>) => void) | null =
    null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly requests: LumaRawWorkerRequest[] = []
  readonly transfers: Transferable[][] = []
  readonly terminate = vi.fn()

  constructor(private readonly shouldRespond = true) {}

  readonly postMessage = vi.fn(
    (request: LumaRawWorkerRequest, transfer?: Transferable[]) => {
      this.requests.push(request)
      this.transfers.push([...(transfer ?? [])])

      if (!this.shouldRespond) return

      queueMicrotask(() => {
        if (request.type === 'init') {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: true,
              type: 'init',
              payload: {
                runtime: 'luma',
                version: '0.1.0',
                simd: true,
                pthreads: true,
                crossOriginIsolated: true,
                memoryTier: 'normal',
                workerPoolSize: 2,
              },
            },
          } as MessageEvent<LumaRawWorkerResponse>)
        }

        if (request.type === 'openSession') {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: true,
              type: 'openSession',
              payload: {
                sessionId: 'session-1',
                probe: {
                  jobId: request.id,
                  width: 1,
                  height: 1,
                  supportLevel: 'experimental',
                  timings: {
                    total: 7,
                  },
                },
                timings: {
                  total: 7,
                },
              },
            },
          } as MessageEvent<LumaRawWorkerResponse>)
        }

        if (request.type === 'extractEmbeddedPreviewFromSession') {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: true,
              type: 'extractEmbeddedPreviewFromSession',
              payload: null,
            },
          } as MessageEvent<LumaRawWorkerResponse>)
        }

        if (request.type === 'decodeQuickFromSession') {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: true,
              type: 'decodeQuickFromSession',
              payload: {
                jobId: request.id,
                sessionId: request.payload.sessionId,
                source: 'quick',
                width: 1,
                height: 1,
                data: new Uint16Array([1, 2, 3]),
                layout: 'rgb',
                bitDepth: 16,
                colorSpace: 'linear-prophoto-rgb',
                orientation: 1,
                metadata: {
                  width: 1,
                  height: 1,
                  supportLevel: 'experimental',
                },
                timings: {
                  total: 9,
                },
              },
            },
          } as MessageEvent<LumaRawWorkerResponse>)
        }

        if (request.type === 'decodeHqFromSession') {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: true,
              type: 'decodeHqFromSession',
              payload: {
                jobId: request.id,
                sessionId: request.payload.sessionId,
                source: 'hq',
                width: 2,
                height: 2,
                data: new Uint16Array([4, 5, 6, 7]),
                layout: 'rgb',
                bitDepth: 16,
                colorSpace: 'linear-prophoto-rgb',
                orientation: 1,
                metadata: {
                  width: 2,
                  height: 2,
                  supportLevel: 'official',
                },
                timings: {
                  total: 11,
                },
              },
            },
          } as MessageEvent<LumaRawWorkerResponse>)
        }

        if (request.type === 'closeSession') {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: true,
              type: 'closeSession',
              payload: { closed: true },
            },
          } as MessageEvent<LumaRawWorkerResponse>)
        }

        if (request.type === 'probe') {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: true,
              type: 'probe',
              payload: {
                jobId: request.id,
                width: 1,
                height: 1,
                supportLevel: 'experimental',
                timings: {
                  total: 7,
                },
              },
            },
          } as MessageEvent<LumaRawWorkerResponse>)
        }

        if (request.type === 'extractEmbeddedPreview') {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: true,
              type: 'extractEmbeddedPreview',
              payload: null,
            },
          } as MessageEvent<LumaRawWorkerResponse>)
        }

        if (request.type === 'decodeQuick') {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: true,
              type: 'decodeQuick',
              payload: {
                jobId: request.id,
                source: 'quick',
                width: 1,
                height: 1,
                data: new Uint16Array([1, 2, 3]),
                layout: 'rgb',
                bitDepth: 16,
                colorSpace: 'linear-prophoto-rgb',
                orientation: 1,
                metadata: {
                  width: 1,
                  height: 1,
                  supportLevel: 'experimental',
                },
                timings: {
                  total: 9,
                },
              },
            },
          } as MessageEvent<LumaRawWorkerResponse>)
        }

        if (request.type === 'decodeHq') {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: true,
              type: 'decodeHq',
              payload: {
                jobId: request.id,
                source: 'hq',
                width: 2,
                height: 2,
                data: new Uint16Array([4, 5, 6, 7]),
                layout: 'rgb',
                bitDepth: 16,
                colorSpace: 'linear-prophoto-rgb',
                orientation: 1,
                metadata: {
                  width: 2,
                  height: 2,
                  supportLevel: 'official',
                },
                timings: {
                  total: 11,
                },
              },
            },
          } as MessageEvent<LumaRawWorkerResponse>)
        }
      })
    },
  )
}

class EchoWorker {
  onmessage: ((event: MessageEvent<LumaRawWorkerResponse>) => void) | null =
    null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly terminate = vi.fn()

  constructor(
    private readonly handleRequest: (
      request: LumaRawWorkerRequest,
    ) => LumaRawWorkerResponse,
  ) {}

  readonly postMessage = vi.fn((request: LumaRawWorkerRequest) => {
    const response = this.handleRequest(request)
    queueMicrotask(() => {
      this.onmessage?.({
        data: response,
      } as MessageEvent<LumaRawWorkerResponse>)
    })
  })
}

function createRuntime(worker = new RecordingWorker()) {
  return {
    runtime: createLumaRawRuntime({
      requireCrossOriginIsolation: false,
      workerFactory: () => worker as unknown as Worker,
    }),
    worker,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('createLumaRawRuntime', () => {
  it('initializes through the worker client', async () => {
    const { runtime, worker } = createRuntime()

    await expect(runtime.init()).resolves.toMatchObject({
      runtime: 'luma',
      memoryTier: 'normal',
    })

    expect(worker.postMessage).toHaveBeenCalledWith(
      {
        id: expect.any(String),
        type: 'init',
        payload: {
          requireCrossOriginIsolation: false,
        },
      },
      [],
    )

    runtime.dispose()
  })

  it('passes file metadata, transferables, and read timings into probe results', async () => {
    const { runtime, worker } = createRuntime()
    const timingSpy = vi.spyOn(performance, 'now')
    let now = 100
    timingSpy.mockImplementation(() => {
      const value = now
      now += 20
      return value
    })

    const file = new File(['raw'], 'sample.ARW')
    const probe = await runtime.probe(file)

    expect(worker.requests[0]).toMatchObject({
      type: 'openSession',
      payload: {
        fileName: 'sample.ARW',
        fileSize: file.size,
      },
    })
    expect(worker.transfers[0]).toHaveLength(1)
    const probeRequest = worker.requests[0]
    if (probeRequest.type !== 'openSession') {
      throw new Error('Expected openSession request.')
    }
    expect(worker.transfers[0][0]).toBe(probeRequest.payload.fileBuffer)
    expect(probe).toMatchObject({
      jobId: worker.requests[0].id,
      supportLevel: 'experimental',
      timings: {
        total: 27,
        readFile: 20,
      },
    })

    runtime.dispose()
  })

  it('passes through null embedded previews', async () => {
    const { runtime, worker } = createRuntime()

    const preview = await runtime.extractEmbeddedPreview(
      new File(['raw'], 'sample.ARW'),
    )

    expect(preview).toBeNull()
    expect(worker.requests[0]).toMatchObject({
      type: 'openSession',
      payload: {
        fileName: 'sample.ARW',
      },
    })
    expect(worker.requests[1]).toMatchObject({
      type: 'extractEmbeddedPreviewFromSession',
      payload: {
        sessionId: 'session-1',
      },
    })

    runtime.dispose()
  })

  it('returns HQ decode frames through a temporary session', async () => {
    const { runtime, worker } = createRuntime()
    const timingSpy = vi.spyOn(performance, 'now')
    let now = 200
    timingSpy.mockImplementation(() => {
      const value = now
      now += 10
      return value
    })

    const frame = await runtime.decodeHq(new File(['raw'], 'sample.ARW'))

    expect(frame).toMatchObject({
      source: 'hq',
      colorSpace: 'linear-prophoto-rgb',
      timings: {
        total: 11,
      },
    })
    expect(worker.requests[0]).toMatchObject({
      type: 'openSession',
      payload: {
        fileName: 'sample.ARW',
        fileSize: 3,
      },
    })
    expect(worker.requests[1]).toMatchObject({
      type: 'decodeHqFromSession',
      payload: {
        sessionId: 'session-1',
      },
    })

    runtime.dispose()
  })

  it('opens a session once and runs embedded, quick, and HQ by session id', async () => {
    const requests: string[] = []
    const worker = new EchoWorker((request) => {
      requests.push(request.type)

      if (request.type === 'openSession') {
        return {
          id: request.id,
          ok: true,
          type: 'openSession',
          payload: {
            sessionId: 'session-1',
            probe: {
              jobId: request.id,
              width: 6240,
              height: 4168,
              supportLevel: 'experimental',
              timings: { total: 10 },
            },
            timings: {
              readFile: 5,
              transferToWorker: 1,
              copyToWasm: 20,
              librawOpen: 30,
              total: 56,
            },
            heap: { before: 268435456, after: 268435456 },
          },
        }
      }

      if (request.type === 'extractEmbeddedPreviewFromSession') {
        return {
          id: request.id,
          ok: true,
          type: request.type,
          payload: {
            jobId: request.id,
            sessionId: 'session-1',
            source: 'embedded',
            width: 1616,
            height: 1080,
            data: new Uint8Array([1, 2, 3]),
            mimeType: 'image/jpeg',
            colorSpace: 'display-srgb-preview',
            orientation: 1,
            timings: { thumbnail: 7, total: 7 },
            heap: { before: 268435456, after: 268435456 },
          },
        }
      }

      if (
        request.type === 'decodeQuickFromSession' ||
        request.type === 'decodeHqFromSession'
      ) {
        return {
          id: request.id,
          ok: true,
          type: request.type,
          payload: {
            jobId: request.id,
            sessionId: 'session-1',
            source: request.type === 'decodeHqFromSession' ? 'hq' : 'quick',
            width: 1000,
            height: 667,
            data: new Uint16Array(1000 * 667 * 3),
            layout: 'rgb',
            bitDepth: 16,
            colorSpace: 'linear-prophoto-rgb',
            orientation: 1,
            metadata: {
              width: 1000,
              height: 667,
              supportLevel: 'experimental',
            },
            timings: { unpack: 100, total: 100 },
            heap: { before: 268435456, after: 268435456 },
          },
        }
      }

      return {
        id: request.id,
        ok: true,
        type: 'closeSession',
        payload: { closed: true },
      }
    })

    const runtime = createLumaRawRuntime({
      requireCrossOriginIsolation: false,
      workerFactory: () => worker as unknown as Worker,
    })

    const session = await runtime.openSession(new File(['raw'], 'sample.ARW'))
    await session.extractEmbeddedPreview()
    await session.decodeQuick()
    await session.decodeHq()
    session.dispose()

    expect(requests).toEqual([
      'openSession',
      'extractEmbeddedPreviewFromSession',
      'decodeQuickFromSession',
      'decodeHqFromSession',
      'closeSession',
    ])
  })

  it('rejects before file reading starts when aborted', async () => {
    const { runtime, worker } = createRuntime()
    const readFile = vi.fn(() => Promise.resolve(new ArrayBuffer(4)))
    const file = {
      name: 'sample.ARW',
      size: 4,
      arrayBuffer: readFile,
    } as unknown as File
    const controller = new AbortController()

    controller.abort()

    await expect(
      runtime.decodeQuick(file, controller.signal),
    ).rejects.toMatchObject({
      code: 'RAW_JOB_CANCELLED',
    })
    expect(readFile).not.toHaveBeenCalled()
    expect(worker.postMessage).not.toHaveBeenCalled()

    runtime.dispose()
  })

  it('rejects while reading and never posts the worker request', async () => {
    const { runtime, worker } = createRuntime()
    const file = new File(['raw'], 'sample.ARW')
    const controller = new AbortController()
    const fileReaderState = {
      readCalls: 0,
      aborted: 0,
    }
    class AbortableFileReader {
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null
      onabort: ((event: ProgressEvent<FileReader>) => void) | null = null
      result: string | ArrayBuffer | null = null
      error: DOMException | null = null
      readAsArrayBuffer(_blob: Blob) {
        fileReaderState.readCalls += 1
      }
      abort() {
        fileReaderState.aborted += 1
      }
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() {
        return true
      }
    }
    vi.stubGlobal('FileReader', AbortableFileReader)

    const promise = runtime.decodeQuick(file, controller.signal)
    expect(fileReaderState.readCalls).toBe(1)

    controller.abort()

    await expect(promise).rejects.toMatchObject({
      code: 'RAW_JOB_CANCELLED',
    })
    expect(fileReaderState.aborted).toBe(1)
    expect(worker.postMessage).not.toHaveBeenCalled()

    runtime.dispose()
  })

  it('disposes the worker and rejects pending requests', async () => {
    const { runtime, worker } = createRuntime(new RecordingWorker(false))
    const readFile = vi.fn(() => Promise.resolve(new ArrayBuffer(4)))
    const file = {
      name: 'sample.ARW',
      size: 4,
      arrayBuffer: readFile,
    } as unknown as File

    const promise = runtime.decodeQuick(file)

    await Promise.resolve()
    await Promise.resolve()

    expect(readFile).toHaveBeenCalledTimes(1)
    expect(worker.requests).toHaveLength(1)

    runtime.dispose()

    await expect(promise).rejects.toMatchObject({
      code: 'RAW_RUNTIME_UNAVAILABLE',
    })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})
