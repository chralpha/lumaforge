import { LumaRawRuntimeError } from './errors'
import type {
  LumaRawWorkerPayloadByType,
  LumaRawWorkerRequest,
  LumaRawWorkerRequestType,
  LumaRawWorkerResponse,
} from './worker-protocol'
import { collectTransferables } from './worker-protocol'

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  abortListener?: () => void
  signal?: AbortSignal
}

let requestCounter = 0

function nextRequestId() {
  requestCounter += 1
  return `raw-job-${requestCounter}`
}

export class LumaRawWorkerClient {
  private worker: Worker | null = null
  private readonly pending = new Map<string, PendingRequest>()

  constructor(private readonly createWorker: () => Worker) {}

  request<T extends LumaRawWorkerRequestType>(
    type: T,
    payload: Extract<LumaRawWorkerRequest, { type: T }>['payload'],
    transfer: Transferable[] = collectTransferables(payload),
    signal?: AbortSignal,
  ): Promise<LumaRawWorkerPayloadByType[T]> {
    const worker = this.ensureWorker()
    const id = nextRequestId()

    const request = {
      id,
      type,
      payload,
    } as LumaRawWorkerRequest

    return new Promise<LumaRawWorkerPayloadByType[T]>((resolve, reject) => {
      if (signal?.aborted) {
        reject(
          new LumaRawRuntimeError(
            'RAW_JOB_CANCELLED',
            'RAW runtime job was cancelled.',
          ),
        )
        return
      }

      const abortListener = () => {
        this.pending.delete(id)
        worker.postMessage({
          id: nextRequestId(),
          type: 'cancel',
          payload: { targetJobId: id },
        } satisfies LumaRawWorkerRequest)
        reject(
          new LumaRawRuntimeError(
            'RAW_JOB_CANCELLED',
            'RAW runtime job was cancelled.',
          ),
        )
      }

      signal?.addEventListener('abort', abortListener, { once: true })
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        abortListener,
        signal,
      })

      worker.postMessage(request, transfer)
    })
  }

  dispose() {
    for (const pending of this.pending.values()) {
      pending.reject(
        new LumaRawRuntimeError(
          'RAW_RUNTIME_UNAVAILABLE',
          'RAW runtime worker was disposed.',
        ),
      )
    }
    this.pending.clear()
    this.worker?.terminate()
    this.worker = null
  }

  private ensureWorker() {
    if (this.worker) return this.worker

    const worker = this.createWorker()
    worker.onmessage = (event: MessageEvent<LumaRawWorkerResponse>) => {
      this.handleResponse(event.data)
    }
    worker.onerror = (event) => {
      const error = new LumaRawRuntimeError(
        'RAW_WORKER_PROTOCOL_ERROR',
        event.message || 'RAW runtime worker failed.',
      )
      for (const pending of this.pending.values()) {
        pending.reject(error)
      }
      this.pending.clear()
    }
    this.worker = worker
    return worker
  }

  private handleResponse(response: LumaRawWorkerResponse) {
    const pending = this.pending.get(response.id)
    if (!pending) return

    this.pending.delete(response.id)
    if (pending.abortListener) {
      pending.signal?.removeEventListener('abort', pending.abortListener)
    }

    if (response.ok) {
      pending.resolve(response.payload)
      return
    }

    pending.reject(
      new LumaRawRuntimeError(response.error.code, response.error.message),
    )
  }
}
