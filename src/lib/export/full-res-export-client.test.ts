import type {
  FullResExportWorkerRequest,
  FullResExportWorkerResponse,
} from './full-res-export-client'
import { FullResolutionExportWorkerClient } from './full-res-export-client'

class FakeWorker {
  onmessage:
    | ((event: MessageEvent<FullResExportWorkerResponse>) => void)
    | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly postMessage = vi.fn(
    (message: FullResExportWorkerRequest, _transfer?: Transferable[]) => {
      this.requests.push(message)
    },
  )
  readonly terminate = vi.fn()
  readonly requests: FullResExportWorkerRequest[] = []

  emit(message: FullResExportWorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent<FullResExportWorkerResponse>)
  }

  emitError(message: string) {
    this.onerror?.({ message } as ErrorEvent)
  }
}

const supportedGraph = {
  supported: true as const,
  outputGamut: 'srgb-rec709' as const,
  outputTransfer: 'srgb' as const,
  lutProfile: null,
  steps: [{ kind: 'input-linear-prophoto' as const }, { kind: 'output-srgb' as const }],
}

describe('FullResolutionExportWorkerClient', () => {
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
})
