import type { ExportColorGraphDescriptor } from '@lumaforge/luma-color-runtime'

import type {
  ExportCheckpointMode,
  ExportExecutionProfileName,
  ExportOutputSink,
  ExportRuntimeMemoryProfile,
} from './execution-profile'
import type { FullResolutionExportProgress } from './full-res-export'
import type { ExportOutputResult } from './output-sink'
import type { ExportPerfMetric } from './perf/export-metrics'
import { normalizeExportConcurrency } from './pipeline-concurrency'
import type { SourceFingerprint } from './source-fingerprint'
import { normalizePreferredStripRows } from './strip-scheduler'

export type FullResWorkerExecutionPlan = {
  profileName: ExportExecutionProfileName
  preferredRows: number
  concurrency: number
  runtimeMemoryProfile: ExportRuntimeMemoryProfile
  outputSink: ExportOutputSink
  checkpointMode: ExportCheckpointMode
}

export type FullResWorkerCheckpointConfig = {
  exportId: string
  graphFingerprint: string
  sourceFingerprint: SourceFingerprint
}

export type FullResExportWorkerStartMessage = {
  kind: 'start'
  requestId: string
  file: File
  graph: ExportColorGraphDescriptor
  executionPlan?: FullResWorkerExecutionPlan
  checkpoint?: FullResWorkerCheckpointConfig
  preferredRows?: number
  concurrency?: number
  quality?: number
  collectMetrics: boolean
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
  result: ExportOutputResult
}

export type FullResWorkerCheckpointMetric = {
  kind: 'checkpoint'
  requestId: string
  completedRowsForDiagnostics: number
  totalRows: number
  stripRows: number
  timestamp: string
}

export type FullResExportWorkerErrorMessage = {
  kind: 'error'
  requestId: string
  message: string
}

export type FullResExportWorkerMetricMessage = {
  kind: 'metric'
  requestId: string
  metric: ExportPerfMetric | FullResWorkerCheckpointMetric
}

export type FullResExportWorkerResponse =
  | FullResExportWorkerProgressMessage
  | FullResExportWorkerSuccessMessage
  | FullResExportWorkerErrorMessage
  | FullResExportWorkerMetricMessage

export type RunFullResolutionJpegExportInWorkerInput = {
  file: File
  graph: ExportColorGraphDescriptor
  preferredRows?: number
  concurrency?: number
  quality?: number
  executionPlan?: FullResWorkerExecutionPlan
  checkpoint?: FullResWorkerCheckpointConfig
  signal?: AbortSignal
  onProgress?: (progress: FullResolutionExportProgress) => void
  onMetric?: (metric: ExportPerfMetric | FullResWorkerCheckpointMetric) => void
}

type PendingRequest = {
  resolve: (value: ExportOutputResult) => void
  reject: (reason?: unknown) => void
  onProgress?: (progress: FullResolutionExportProgress) => void
  onMetric?: (metric: ExportPerfMetric | FullResWorkerCheckpointMetric) => void
  cleanup: () => void
}

function createDisposedError() {
  return new Error('FULL_RES_EXPORT_WORKER_DISPOSED')
}

function createCancelledError() {
  return new Error('FULL_RES_EXPORT_CANCELLED')
}

function createWorkerFailedError() {
  return new Error('FULL_RES_EXPORT_WORKER_FAILED')
}

function createWorkerPostError(error: unknown) {
  if (error instanceof Error) {
    return error
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message
  ) {
    return new Error(error.message)
  }

  return new Error('FULL_RES_EXPORT_WORKER_ERROR')
}

function createRequestId() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `full-res-export-${crypto.randomUUID()}`
  }

  return `full-res-export-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export class FullResolutionExportWorkerClient {
  private readonly workerFactory: () => Worker
  private worker: Worker | null = null
  private readonly pending = new Map<string, PendingRequest>()
  private disposed = false

  constructor(
    workerFactory: () => Worker = () =>
      new Worker(new URL('./full-res-export.worker.ts', import.meta.url), {
        type: 'module',
      }),
  ) {
    this.workerFactory = workerFactory
  }

  private ensureWorker() {
    if (this.disposed) {
      throw createDisposedError()
    }

    if (this.worker) {
      return this.worker
    }

    const worker = this.workerFactory()
    const handleWorkerFailure = () => {
      this.rejectPending(createWorkerFailedError())
      this.resetWorker()
    }

    worker.onmessage = (event: MessageEvent<FullResExportWorkerResponse>) => {
      const response = event.data
      const pending = this.pending.get(response.requestId)
      if (!pending) return

      if (response.kind === 'progress') {
        pending.onProgress?.(response.progress)
        return
      }

      if (response.kind === 'metric') {
        pending.onMetric?.(response.metric)
        return
      }

      this.pending.delete(response.requestId)
      pending.cleanup()

      if (response.kind === 'success') {
        pending.resolve(response.result)
        return
      }

      pending.reject(new Error(response.message))
    }

    worker.onerror = () => handleWorkerFailure()
    worker.onmessageerror = () => handleWorkerFailure()

    this.worker = worker
    return worker
  }

  private rejectPending(error: Error) {
    for (const [requestId, pending] of this.pending) {
      this.pending.delete(requestId)
      pending.cleanup()
      pending.reject(error)
    }
  }

  private resetWorker() {
    if (!this.worker) {
      return
    }

    this.worker.onmessage = null
    this.worker.onerror = null
    this.worker.onmessageerror = null
    this.worker.terminate()
    this.worker = null
  }

  run(input: RunFullResolutionJpegExportInWorkerInput) {
    if (this.disposed) {
      return Promise.reject(createDisposedError())
    }

    if (input.signal?.aborted) {
      return Promise.reject(createCancelledError())
    }

    let preferredRows: number | undefined
    let concurrency: number | undefined
    try {
      preferredRows =
        input.preferredRows === undefined
          ? undefined
          : normalizePreferredStripRows(input.preferredRows)
      concurrency =
        input.concurrency === undefined
          ? undefined
          : normalizeExportConcurrency(input.concurrency, 'balanced')
    } catch (error) {
      return Promise.reject(createWorkerPostError(error))
    }

    const requestId = createRequestId()

    return new Promise<ExportOutputResult>((resolve, reject) => {
      let worker: Worker

      const onAbort = () => {
        if (!this.pending.has(requestId)) return

        try {
          worker.postMessage({
            kind: 'cancel',
            requestId,
          } satisfies FullResExportWorkerCancelMessage)
        } catch (error) {
          this.rejectPending(createWorkerPostError(error))
          this.resetWorker()
          return
        }

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
        onMetric: input.onMetric,
        cleanup,
      })

      input.signal?.addEventListener('abort', onAbort, { once: true })

      try {
        worker = this.ensureWorker()
        worker.postMessage({
          kind: 'start',
          requestId,
          file: input.file,
          graph: input.graph,
          executionPlan: input.executionPlan,
          checkpoint: input.checkpoint,
          preferredRows,
          concurrency,
          quality: input.quality,
          collectMetrics: Boolean(input.onMetric),
        } satisfies FullResExportWorkerStartMessage)
      } catch (error) {
        this.rejectPending(createWorkerPostError(error))
        this.resetWorker()
      }
    })
  }

  dispose() {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.rejectPending(createDisposedError())
    this.resetWorker()
  }
}

export function runFullResolutionJpegExportInWorker(
  input: RunFullResolutionJpegExportInWorkerInput,
  clientFactory: () => FullResolutionExportWorkerClient = () =>
    new FullResolutionExportWorkerClient(),
) {
  const client = clientFactory()
  return client.run(input).finally(() => {
    client.dispose()
  })
}
