import type {
  FullResExportWorkerRequest,
  FullResExportWorkerResponse,
} from './full-res-export-client'
import {
  FullResolutionExportWorkerClient,
  runFullResolutionJpegExportInWorker,
} from './full-res-export-client'

class FakeWorker {
  onmessage:
    | ((event: MessageEvent<FullResExportWorkerResponse>) => void)
    | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  readonly postMessage = vi.fn(
    (message: FullResExportWorkerRequest, _transfer?: Transferable[]) => {
      this.requests.push(message)
    },
  )
  readonly terminate = vi.fn()
  readonly requests: FullResExportWorkerRequest[] = []

  emit(message: FullResExportWorkerResponse) {
    this.onmessage?.({
      data: message,
    } as MessageEvent<FullResExportWorkerResponse>)
  }

  emitError(message: string) {
    this.onerror?.({ message } as ErrorEvent)
  }

  emitMessageError() {
    this.onmessageerror?.({} as MessageEvent)
  }
}

class ThrowingStartWorker extends FakeWorker {
  override readonly postMessage = vi.fn(
    (_message: FullResExportWorkerRequest, _transfer?: Transferable[]) => {
      throw new DOMException('failed to post start message')
    },
  )
}

class ThrowingCancelWorker extends FakeWorker {
  override readonly postMessage = vi.fn(
    (message: FullResExportWorkerRequest, _transfer?: Transferable[]) => {
      this.requests.push(message)
      if (message.kind === 'cancel') {
        throw new DOMException('failed to post cancel message')
      }
    },
  )
}

const supportedGraph = {
  supported: true as const,
  outputGamut: 'srgb-rec709' as const,
  outputTransfer: 'srgb' as const,
  lutProfile: null,
  steps: [
    { kind: 'input-linear-prophoto' as const },
    { kind: 'output-srgb' as const },
  ],
}

describe('fullResolutionExportWorkerClient', () => {
  it('streams progress, resolves success, and the one-shot helper disposes its worker', async () => {
    const worker = new FakeWorker()
    const workerFactory = vi.fn(() => worker as unknown as Worker)

    const promise = runFullResolutionJpegExportInWorker(
      {
        file: new File(['raw'], 'sample.ARW'),
        graph: supportedGraph,
        onProgress: (progress) => {
          expect(progress.progress).toBe(50)
        },
      },
      () => new FullResolutionExportWorkerClient(workerFactory),
    )
    const startRequest = worker.requests[0]

    if (!startRequest || startRequest.kind !== 'start') {
      throw new Error('Expected a start request.')
    }

    worker.emit({
      kind: 'progress',
      requestId: startRequest.requestId,
      progress: {
        completedStrips: 1,
        totalStrips: 2,
        progress: 50,
      },
    })
    worker.emit({
      kind: 'success',
      requestId: startRequest.requestId,
      blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
    })

    await expect(promise).resolves.toMatchObject({ type: 'image/jpeg' })
    expect(workerFactory).toHaveBeenCalledTimes(1)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('rejects with the worker error message', async () => {
    const worker = new FakeWorker()
    const client = new FullResolutionExportWorkerClient(
      () => worker as unknown as Worker,
    )

    const promise = client.run({
      file: new File(['raw'], 'sample.ARW'),
      graph: supportedGraph,
    })
    const startRequest = worker.requests[0]

    if (!startRequest || startRequest.kind !== 'start') {
      throw new Error('Expected a start request.')
    }

    worker.emit({
      kind: 'error',
      requestId: startRequest.requestId,
      message: 'FULL_RES_EXPORT_UNSUPPORTED_PIPELINE',
    })

    await expect(promise).rejects.toThrow(
      'FULL_RES_EXPORT_UNSUPPORTED_PIPELINE',
    )
  })

  it('rejects run() after dispose without spawning a worker', async () => {
    const workerFactory = vi.fn(() => new FakeWorker() as unknown as Worker)
    const client = new FullResolutionExportWorkerClient(workerFactory)

    client.dispose()

    await expect(
      client.run({
        file: new File(['raw'], 'sample.ARW'),
        graph: supportedGraph,
      }),
    ).rejects.toThrow('FULL_RES_EXPORT_WORKER_DISPOSED')
    expect(workerFactory).not.toHaveBeenCalled()
  })

  it.each([Infinity, -Infinity, Number.NaN, 0, -1])(
    'rejects invalid preferred row count %s without spawning a worker',
    async (preferredRows) => {
      const workerFactory = vi.fn(() => new FakeWorker() as unknown as Worker)
      const client = new FullResolutionExportWorkerClient(workerFactory)

      await expect(
        client.run({
          file: new File(['raw'], 'sample.ARW'),
          graph: supportedGraph,
          preferredRows,
        }),
      ).rejects.toThrow('FULL_RES_EXPORT_INVALID_PREFERRED_ROWS')
      expect(workerFactory).not.toHaveBeenCalled()
    },
  )

  it('rejects pending requests, terminates the broken worker, and uses a fresh worker after onerror', async () => {
    const brokenWorker = new FakeWorker()
    const recoveredWorker = new FakeWorker()
    const workerFactory = vi
      .fn()
      .mockReturnValueOnce(brokenWorker as unknown as Worker)
      .mockReturnValueOnce(recoveredWorker as unknown as Worker)
    const client = new FullResolutionExportWorkerClient(workerFactory)

    const brokenPromise = client.run({
      file: new File(['raw'], 'sample.ARW'),
      graph: supportedGraph,
    })
    brokenWorker.emitError('worker failed')

    await expect(brokenPromise).rejects.toThrow('FULL_RES_EXPORT_WORKER_FAILED')
    expect(brokenWorker.terminate).toHaveBeenCalledTimes(1)

    const recoveredPromise = client.run({
      file: new File(['raw'], 'sample.ARW'),
      graph: supportedGraph,
    })
    const startRequest = recoveredWorker.requests[0]

    if (!startRequest || startRequest.kind !== 'start') {
      throw new Error('Expected a start request.')
    }

    recoveredWorker.emit({
      kind: 'success',
      requestId: startRequest.requestId,
      blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
    })

    await expect(recoveredPromise).resolves.toMatchObject({
      type: 'image/jpeg',
    })
    expect(workerFactory).toHaveBeenCalledTimes(2)
  })

  it('rejects pending requests and terminates the worker after onmessageerror', async () => {
    const worker = new FakeWorker()
    const client = new FullResolutionExportWorkerClient(
      () => worker as unknown as Worker,
    )

    const promise = client.run({
      file: new File(['raw'], 'sample.ARW'),
      graph: supportedGraph,
    })
    worker.emitMessageError()

    await expect(promise).rejects.toThrow('FULL_RES_EXPORT_WORKER_FAILED')
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('posts cancel and rejects when the abort signal fires', async () => {
    const worker = new FakeWorker()
    const client = new FullResolutionExportWorkerClient(
      () => worker as unknown as Worker,
    )
    const controller = new AbortController()

    const promise = client.run({
      file: new File(['raw'], 'sample.ARW'),
      graph: supportedGraph,
      signal: controller.signal,
    })
    const startRequest = worker.requests[0]
    controller.abort()

    await expect(promise).rejects.toThrow('FULL_RES_EXPORT_CANCELLED')
    expect(startRequest).toMatchObject({ kind: 'start' })
    expect(worker.requests[1]).toMatchObject({
      kind: 'cancel',
      requestId:
        startRequest && startRequest.kind === 'start'
          ? startRequest.requestId
          : undefined,
    })
  })

  it('rejects and tears down the worker when start postMessage throws', async () => {
    const worker = new ThrowingStartWorker()
    const client = new FullResolutionExportWorkerClient(
      () => worker as unknown as Worker,
    )

    await expect(
      client.run({
        file: new File(['raw'], 'sample.ARW'),
        graph: supportedGraph,
      }),
    ).rejects.toThrow('failed to post start message')
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('rejects and tears down the worker when cancel postMessage throws', async () => {
    const worker = new ThrowingCancelWorker()
    const client = new FullResolutionExportWorkerClient(
      () => worker as unknown as Worker,
    )
    const controller = new AbortController()

    const promise = client.run({
      file: new File(['raw'], 'sample.ARW'),
      graph: supportedGraph,
      signal: controller.signal,
    })
    controller.abort()

    await expect(promise).rejects.toThrow('failed to post cancel message')
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('one-shot helper does not spawn a worker when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const workerFactory = vi.fn(() => new FakeWorker() as unknown as Worker)

    await expect(
      runFullResolutionJpegExportInWorker(
        {
          file: new File(['raw'], 'sample.ARW'),
          graph: supportedGraph,
          signal: controller.signal,
        },
        () => new FullResolutionExportWorkerClient(workerFactory),
      ),
    ).rejects.toThrow('FULL_RES_EXPORT_CANCELLED')
    expect(workerFactory).not.toHaveBeenCalled()
  })
})
