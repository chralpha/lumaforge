import { describe, expect, it, vi } from 'vitest'

import { createLumaRawRuntime } from './runtime'
import type {
  LumaRawWorkerRequest,
  LumaRawWorkerResponse,
} from './worker-protocol'

class EchoWorker {
  onmessage: ((event: MessageEvent<LumaRawWorkerResponse>) => void) | null =
    null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly terminate = vi.fn()
  readonly postMessage = vi.fn((request: LumaRawWorkerRequest) => {
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
                readFile: 0,
                total: 1,
              },
            },
          },
        } as MessageEvent<LumaRawWorkerResponse>)
      }
    })
  })
}

describe('createLumaRawRuntime', () => {
  it('initializes through the worker client', async () => {
    const runtime = createLumaRawRuntime({
      requireCrossOriginIsolation: false,
      workerFactory: () => new EchoWorker() as unknown as Worker,
    })

    await expect(runtime.init()).resolves.toMatchObject({
      runtime: 'luma',
      memoryTier: 'normal',
    })

    runtime.dispose()
  })

  it('reads File bytes and returns RGB16 quick frames', async () => {
    const runtime = createLumaRawRuntime({
      requireCrossOriginIsolation: false,
      workerFactory: () => new EchoWorker() as unknown as Worker,
    })

    const frame = await runtime.decodeQuick(new File(['raw'], 'sample.ARW'))

    expect(frame.data).toBeInstanceOf(Uint16Array)
    expect(frame.colorSpace).toBe('linear-prophoto-rgb')

    runtime.dispose()
  })
})
