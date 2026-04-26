import type { ExportColorGraphDescriptor } from './color-graph'
import type { FullResolutionExportProgress } from './full-res-export'

export type FullResExportWorkerStartMessage = {
  kind: 'start'
  requestId: string
  file: File
  graph: ExportColorGraphDescriptor
  preferredRows?: number
  quality?: number
}

export type FullResExportWorkerCancelMessage = {
  kind: 'cancel'
  requestId: string
}

export type FullResExportWorkerRequest =
  | FullResExportWorkerStartMessage
  | FullResExportWorkerCancelMessage

export type FullResExportWorkerProgressMessage = {
  kind: 'progress'
  requestId: string
  progress: FullResolutionExportProgress
}

export type FullResExportWorkerSuccessMessage = {
  kind: 'success'
  requestId: string
  blob: Blob
}

export type FullResExportWorkerErrorMessage = {
  kind: 'error'
  requestId: string
  message: string
}

export type FullResExportWorkerResponse =
  | FullResExportWorkerProgressMessage
  | FullResExportWorkerSuccessMessage
  | FullResExportWorkerErrorMessage

export type RunFullResolutionJpegExportInWorkerInput = {
  file: File
  graph: ExportColorGraphDescriptor
  preferredRows?: number
  quality?: number
  signal?: AbortSignal
  onProgress?: (progress: FullResolutionExportProgress) => void
}

type PendingRequest = {
  resolve: (value: Blob) => void
  reject: (reason?: unknown) => void
  onProgress?: (progress: FullResolutionExportProgress) => void
  cleanup: () => void
}

function createCancelledError() {
  return new Error('FULL_RES_EXPORT_CANCELLED')
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `full-res-export-${crypto.randomUUID()}`
  }

  return `full-res-export-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export class FullResolutionExportWorkerClient {
  private readonly worker: Worker
  private readonly pending = new Map<string, PendingRequest>()

  constructor(
    workerFactory: () => Worker = () =>
      new Worker(new URL('./full-res-export.worker.ts', import.meta.url), {
        type: 'module',
      }),
  ) {
    this.worker = workerFactory()
    this.worker.onmessage = (event: MessageEvent<FullResExportWorkerResponse>) => {
      const response = event.data
      const pending = this.pending.get(response.requestId)
      if (!pending) return

      if (response.kind === 'progress') {
        pending.onProgress?.(response.progress)
        return
      }

      this.pending.delete(response.requestId)
      pending.cleanup()

      if (response.kind === 'success') {
        pending.resolve(response.blob)
        return
      }

      pending.reject(new Error(response.message))
    }

    this.worker.onerror = (event: ErrorEvent) => {
      const message = event.message || 'FULL_RES_EXPORT_WORKER_ERROR'
      for (const [requestId, pending] of this.pending) {
        this.pending.delete(requestId)
        pending.cleanup()
        pending.reject(new Error(message))
      }
    }
  }

  run(input: RunFullResolutionJpegExportInWorkerInput) {
    if (input.signal?.aborted) {
      return Promise.reject(createCancelledError())
    }

    const requestId = createRequestId()

    return new Promise<Blob>((resolve, reject) => {
      const onAbort = () => {
        if (!this.pending.has(requestId)) return

        this.worker.postMessage({
          kind: 'cancel',
          requestId,
        } satisfies FullResExportWorkerCancelMessage)
        this.pending.delete(requestId)
        cleanup()
        reject(createCancelledError())
      }

      const cleanup = () => {
        input.signal?.removeEventListener('abort', onAbort)
      }

      this.pending.set(requestId, {
        resolve,
        reject,
        onProgress: input.onProgress,
        cleanup,
      })

      input.signal?.addEventListener('abort', onAbort, { once: true })

      this.worker.postMessage({
        kind: 'start',
        requestId,
        file: input.file,
        graph: input.graph,
        preferredRows: input.preferredRows,
        quality: input.quality,
      } satisfies FullResExportWorkerStartMessage)
    })
  }

  dispose() {
    for (const [requestId, pending] of this.pending) {
      this.pending.delete(requestId)
      pending.cleanup()
      pending.reject(new Error('FULL_RES_EXPORT_WORKER_DISPOSED'))
    }
    this.worker.terminate()
  }
}

export function runFullResolutionJpegExportInWorker(
  input: RunFullResolutionJpegExportInWorkerInput,
  client = new FullResolutionExportWorkerClient(),
) {
  return client.run(input)
}
