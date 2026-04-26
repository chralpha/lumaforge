import type {
  JpegWorkerRequest,
  JpegWorkerResponse,
} from '../worker/runtime-core'
import { createJpegRuntimeCore } from '../worker/runtime-core'
import { createLumaJpegRuntime } from './runtime'

type JpegWorkerErrorResponse = {
  id: string
  ok: false
  type: JpegWorkerRequest['type']
  error: { message: string }
}

type WorkerResponse = JpegWorkerResponse | JpegWorkerErrorResponse

class CoreBackedWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  private readonly core = createJpegRuntimeCore()

  postMessage(request: JpegWorkerRequest) {
    void this.core
      .handleRequest(request)
      .then((response) => {
        queueMicrotask(() => {
          this.onmessage?.({ data: response } as MessageEvent<WorkerResponse>)
        })
      })
      .catch((error) => {
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: false,
              type: request.type,
              error: {
                message: error instanceof Error ? error.message : String(error),
              },
            },
          } as MessageEvent<WorkerResponse>)
        })
      })
  }

  terminate() {}
}

describe('createLumaJpegRuntime', () => {
  it('encodes ordered RGB8 rows through a worker-backed runtime', async () => {
    const runtime = createLumaJpegRuntime({
      workerFactory: () => new CoreBackedWorker() as unknown as Worker,
    })
    const encoder = runtime.createEncoder({ width: 2, height: 2, quality: 0.9 })

    await encoder.writeRows(
      new Uint8Array([
        255, 255, 255, 0, 0, 0,
        255, 0, 0, 0, 255, 0,
      ]),
      2,
    )
    const blob = await encoder.finish()

    expect(blob.type).toBe('image/jpeg')
    expect(blob.size).toBeGreaterThan(0)
    runtime.dispose()
  })

  it('preserves worker failure messages', async () => {
    const runtime = createLumaJpegRuntime({
      workerFactory: () => new CoreBackedWorker() as unknown as Worker,
    })
    const encoder = runtime.createEncoder({ width: 2, height: 1, quality: 0.9 })

    await expect(
      encoder.writeRows(new Uint8Array([255, 255, 255]), 1),
    ).rejects.toThrow('JPEG_ROW_LENGTH_MISMATCH')
    runtime.dispose()
  })
})
