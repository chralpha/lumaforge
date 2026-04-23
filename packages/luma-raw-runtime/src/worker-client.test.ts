import { describe, expect, it, vi } from 'vitest'

import { LumaRawRuntimeError } from './errors'
import { LumaRawWorkerClient } from './worker-client'
import type {
  LumaRawWorkerRequest,
  LumaRawWorkerResponse,
} from './worker-protocol'
import { collectTransferables } from './worker-protocol'

class FakeWorker {
  onmessage: ((event: MessageEvent<LumaRawWorkerResponse>) => void) | null =
    null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly postMessage = vi.fn(
    (request: LumaRawWorkerRequest, _transfer?: Transferable[]) => {
      this.requests.push(request)
    },
  )
  readonly terminate = vi.fn()
  readonly requests: LumaRawWorkerRequest[] = []

  emit(response: LumaRawWorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<LumaRawWorkerResponse>)
  }

  emitError(message = 'worker failed') {
    this.onerror?.({ message } as ErrorEvent)
  }
}

class ThrowingWorker extends FakeWorker {
  override readonly postMessage = vi.fn(() => {
    throw new DOMException('failed to post message')
  })
}

describe('lumaRawWorkerClient', () => {
  it('deduplicates transferables by backing buffer', () => {
    const buffer = new ArrayBuffer(16)
    const view = new Uint8Array(buffer)

    expect(
      collectTransferables({
        first: buffer,
        second: view,
        third: buffer,
      }),
    ).toHaveLength(1)
  })

  it('correlates worker responses by request id', async () => {
    const fakeWorker = new FakeWorker()
    const client = new LumaRawWorkerClient(
      () => fakeWorker as unknown as Worker,
    )

    const promise = client.request('init', {
      requireCrossOriginIsolation: false,
    })
    const request = fakeWorker.requests[0]

    fakeWorker.emit({
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
    })

    await expect(promise).resolves.toMatchObject({ runtime: 'luma' })
  })

  it('posts cancel and rejects when AbortSignal fires', async () => {
    const fakeWorker = new FakeWorker()
    const client = new LumaRawWorkerClient(
      () => fakeWorker as unknown as Worker,
    )
    const controller = new AbortController()

    const promise = client.request(
      'decodeQuick',
      {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
      [new ArrayBuffer(1)],
      controller.signal,
    )

    const decodeRequest = fakeWorker.requests[0]
    controller.abort()

    await expect(promise).rejects.toMatchObject({
      code: 'RAW_JOB_CANCELLED',
    })
    expect(fakeWorker.requests[1]).toMatchObject({
      type: 'cancel',
      payload: { targetJobId: decodeRequest.id },
    })
  })

  it('normalizes worker error responses', async () => {
    const fakeWorker = new FakeWorker()
    const client = new LumaRawWorkerClient(
      () => fakeWorker as unknown as Worker,
    )

    const promise = client.request('probe', {
      fileBuffer: new ArrayBuffer(4),
      fileName: 'bad.ARW',
      fileSize: 4,
    })
    const request = fakeWorker.requests[0]

    fakeWorker.emit({
      id: request.id,
      ok: false,
      type: 'probe',
      error: {
        code: 'RAW_OPEN_FAILED',
        message: 'LibRaw open_buffer failed.',
      },
    })

    await expect(promise).rejects.toBeInstanceOf(LumaRawRuntimeError)
    await expect(promise).rejects.toMatchObject({ code: 'RAW_OPEN_FAILED' })
  })

  it('rejects pending requests on dispose', async () => {
    const fakeWorker = new FakeWorker()
    const client = new LumaRawWorkerClient(
      () => fakeWorker as unknown as Worker,
    )
    const controller = new AbortController()

    const promise = client.request(
      'probe',
      {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
      undefined,
      controller.signal,
    )

    client.dispose()
    controller.abort()

    await expect(promise).rejects.toMatchObject({
      code: 'RAW_RUNTIME_UNAVAILABLE',
    })
    expect(fakeWorker.requests).toHaveLength(1)
  })

  it('rejects pending requests on worker error', async () => {
    const fakeWorker = new FakeWorker()
    const client = new LumaRawWorkerClient(
      () => fakeWorker as unknown as Worker,
    )
    const controller = new AbortController()

    const promise = client.request(
      'decodeHq',
      {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
      undefined,
      controller.signal,
    )

    fakeWorker.emitError()
    controller.abort()

    await expect(promise).rejects.toMatchObject({
      code: 'RAW_WORKER_PROTOCOL_ERROR',
    })
    expect(fakeWorker.requests).toHaveLength(1)
  })

  it('cleans up and rejects when postMessage throws', async () => {
    const fakeWorker = new ThrowingWorker()
    const client = new LumaRawWorkerClient(
      () => fakeWorker as unknown as Worker,
    )
    const controller = new AbortController()

    const promise = client.request(
      'extractEmbeddedPreview',
      {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
      undefined,
      controller.signal,
    )

    await expect(promise).rejects.toMatchObject({
      code: 'RAW_WORKER_PROTOCOL_ERROR',
    })
    controller.abort()
    expect(fakeWorker.postMessage).toHaveBeenCalledTimes(1)
  })
})
