import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLumaRawRuntime } from './runtime'
import type {
  LumaRawWorkerRequest,
  LumaRawWorkerResponse,
} from './worker-protocol'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

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
      type: 'probe',
      payload: {
        fileName: 'sample.ARW',
        fileSize: file.size,
      },
    })
    expect(worker.transfers[0]).toHaveLength(1)
    expect(worker.transfers[0][0]).toBeInstanceOf(ArrayBuffer)
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
      type: 'extractEmbeddedPreview',
      payload: {
        fileName: 'sample.ARW',
      },
    })

    runtime.dispose()
  })

  it('returns HQ decode frames with merged read timing', async () => {
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
        total: 21,
        readFile: 10,
      },
    })
    expect(worker.requests[0]).toMatchObject({
      type: 'decodeHq',
      payload: {
        fileName: 'sample.ARW',
        fileSize: 3,
      },
    })

    runtime.dispose()
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
    const deferred = createDeferred<ArrayBuffer>()
    const readFile = vi.fn(() => deferred.promise)
    const file = {
      name: 'sample.ARW',
      size: 4,
      arrayBuffer: readFile,
    } as unknown as File
    const controller = new AbortController()

    const promise = runtime.decodeQuick(file, controller.signal)
    expect(readFile).toHaveBeenCalledTimes(1)

    controller.abort()

    await expect(promise).rejects.toMatchObject({
      code: 'RAW_JOB_CANCELLED',
    })

    deferred.resolve(new ArrayBuffer(4))
    await Promise.resolve()

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
