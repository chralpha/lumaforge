import type { ExportColorGraphDescriptor } from '@lumaforge/luma-color-runtime'

import type { ExportExecutionPlan } from '~/lib/export/execution-profile'
import { selectExportExecutionPlan } from '~/lib/export/execution-profile'
import type { FullResolutionExportProgress } from '~/lib/export/full-res-export'
import type {
  FullResWorkerCheckpointConfig,
  FullResWorkerExecutionPlan,
  RunFullResolutionJpegExportInWorkerInput,
} from '~/lib/export/full-res-export-client'
import { FullResolutionExportWorkerClient } from '~/lib/export/full-res-export-client'
import type { ExportFidelity } from '~/lib/gl/export'

export function buildExportFilename(inputName: string, styleName: string) {
  const basename = inputName.replace(/\.[^.]+$/, '')
  return `${basename}_${styleName}_fullres.jpg`
}

function isOpfsAvailable() {
  if (typeof navigator === 'undefined') return false

  return Boolean(
    (navigator.storage as { getDirectory?: () => unknown } | undefined)
      ?.getDirectory,
  )
}

function isJpegStreamingOutputSinkAvailable() {
  // Web Streams alone are not an export sink; only return true once a bounded
  // JPEG streaming handoff is wired into the worker path.
  return false
}

export function selectCurrentExportExecutionPlan(input: {
  fidelity: ExportFidelity
  sourceWidth?: number
  sourceHeight?: number
  previousInterrupted?: boolean
  previousResourceFailure?: boolean
}) {
  return selectExportExecutionPlan({
    ...input,
    runtime: {
      lowMemoryAvailable: true,
      pthreadAvailable:
        typeof globalThis.crossOriginIsolated === 'boolean'
          ? globalThis.crossOriginIsolated
          : false,
    },
    output: {
      opfsAvailable: isOpfsAvailable(),
      streamingAvailable: isJpegStreamingOutputSinkAvailable(),
    },
    platform: {
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      touch:
        typeof navigator !== 'undefined' &&
        navigator.maxTouchPoints !== undefined &&
        navigator.maxTouchPoints > 0,
      hardwareConcurrency:
        typeof navigator === 'undefined'
          ? undefined
          : navigator.hardwareConcurrency,
    },
  })
}

function selectDefaultExportExecutionPlanForFidelity(fidelity: ExportFidelity) {
  return selectExportExecutionPlan({
    fidelity,
    runtime: {
      lowMemoryAvailable: true,
      pthreadAvailable: true,
    },
    output: {
      opfsAvailable: false,
      streamingAvailable: false,
    },
    platform: {
      userAgent: '',
      touch: false,
    },
  })
}

export function getPreferredRowsForFidelity(fidelity: ExportFidelity) {
  return selectDefaultExportExecutionPlanForFidelity(fidelity).preferredRows
}

export function getConcurrencyForFidelity(fidelity: ExportFidelity) {
  return selectDefaultExportExecutionPlanForFidelity(fidelity).concurrency
}

export type { ExportExecutionPlan }

export type FullResolutionExportAttemptEvent = {
  attempt: number
  profile?: ExportExecutionPlan['profile']['name']
  preferredRows?: number
  concurrency?: number
  phase: 'started' | 'retry-scheduled' | 'disposed'
  retryReason?: string
  previousRows?: number
  nextRows?: number
  previousConcurrency?: number
  nextConcurrency?: number
  freshWorker: boolean
  priorClientDisposed?: boolean
}

export function recommendRetryLevel(
  level: ExportFidelity,
): Exclude<ExportFidelity, 'max'> | null {
  if (level === 'max') return 'balanced'
  if (level === 'balanced') return 'safe'
  return null
}

export async function runPreviewExportJob({
  renderToCanvas,
  filename,
  quality,
}: {
  renderToCanvas: () => Promise<HTMLCanvasElement>
  filename: string
  quality: number
}) {
  const canvas = await renderToCanvas()

  return await new Promise<{ filename: string; blob: Blob }>(
    (resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('EXPORT_JPEG_BLOB_FAILED'))
            return
          }

          resolve({ filename, blob })
        },
        'image/jpeg',
        quality,
      )
    },
  )
}

export function createFullResolutionExportClient() {
  return new FullResolutionExportWorkerClient()
}

function errorLooksLikeFreshWorkerRetry(error: unknown) {
  return (
    error instanceof Error &&
    (error.message === 'FULL_RES_EXPORT_RESOURCE_FAILURE' ||
      error.message === 'FULL_RES_EXPORT_WORKER_FAILED')
  )
}

function getFreshWorkerRetryRows(error: unknown) {
  if (typeof error !== 'object' || !error || !('nextRows' in error)) {
    return undefined
  }

  const nextRows = (error as { nextRows?: unknown }).nextRows
  return typeof nextRows === 'number' && Number.isFinite(nextRows)
    ? nextRows
    : undefined
}

function toWorkerExecutionPlan(
  plan: ExportExecutionPlan,
): FullResWorkerExecutionPlan {
  return {
    profileName: plan.profile.name,
    preferredRows: plan.preferredRows,
    concurrency: plan.concurrency,
    runtimeMemoryProfile: plan.runtimeMemoryProfile,
    outputSink: plan.outputSink,
    checkpointMode: plan.checkpointMode,
  }
}

export async function runFullResolutionExportJob({
  file,
  filename,
  graph,
  quality,
  preferredRows,
  concurrency,
  executionPlan,
  checkpoint,
  onProgress,
  onMetric,
  onAttempt,
  signal,
  clientFactory = createFullResolutionExportClient,
}: {
  file: File
  filename: string
  graph: ExportColorGraphDescriptor
  quality?: RunFullResolutionJpegExportInWorkerInput['quality']
  preferredRows?: RunFullResolutionJpegExportInWorkerInput['preferredRows']
  concurrency?: RunFullResolutionJpegExportInWorkerInput['concurrency']
  executionPlan?: ExportExecutionPlan
  checkpoint?: FullResWorkerCheckpointConfig
  onProgress?: (progress: FullResolutionExportProgress) => void
  onMetric?: RunFullResolutionJpegExportInWorkerInput['onMetric']
  onAttempt?: (event: FullResolutionExportAttemptEvent) => void
  signal?: AbortSignal
  clientFactory?: () => FullResolutionExportWorkerClient
}) {
  let plan = executionPlan
  let attempts = 0

  while (true) {
    attempts += 1
    const client = clientFactory()
    const attemptPlan = plan

    onAttempt?.({
      attempt: attempts,
      profile: attemptPlan?.profile.name,
      preferredRows: attemptPlan?.preferredRows ?? preferredRows,
      concurrency: attemptPlan?.concurrency ?? concurrency,
      phase: 'started',
      freshWorker: true,
    })

    try {
      const output = await client.run({
        file,
        filename,
        graph,
        quality,
        preferredRows: attemptPlan?.preferredRows ?? preferredRows,
        concurrency: attemptPlan?.concurrency ?? concurrency,
        executionPlan: attemptPlan
          ? toWorkerExecutionPlan(attemptPlan)
          : undefined,
        checkpoint: attemptPlan?.profile.checkpointOutput
          ? checkpoint
          : undefined,
        onProgress,
        onMetric,
        signal,
      })

      return { filename, output, attempts }
    } catch (error) {
      if (
        !attemptPlan?.profile.restartWorkerOnResourceRetry ||
        attempts >= 3 ||
        !errorLooksLikeFreshWorkerRetry(error)
      ) {
        throw error
      }

      const nextRows =
        getFreshWorkerRetryRows(error) ??
        Math.floor(attemptPlan.preferredRows / 2)
      const normalizedNextRows = Math.min(
        attemptPlan.profile.maxRows,
        Math.max(attemptPlan.profile.minRows, nextRows),
      )

      onAttempt?.({
        attempt: attempts,
        profile: attemptPlan.profile.name,
        preferredRows: attemptPlan.preferredRows,
        concurrency: attemptPlan.concurrency,
        phase: 'retry-scheduled',
        retryReason:
          error instanceof Error
            ? error.message
            : 'FULL_RES_EXPORT_WORKER_FAILED',
        previousRows: attemptPlan.preferredRows,
        nextRows: normalizedNextRows,
        previousConcurrency: attemptPlan.concurrency,
        nextConcurrency: 1,
        freshWorker: true,
        priorClientDisposed: false,
      })

      plan = {
        ...attemptPlan,
        preferredRows: normalizedNextRows,
        concurrency: 1,
        productCopy: 'resource-retry',
      }
    } finally {
      client.dispose()
      onAttempt?.({
        attempt: attempts,
        profile: attemptPlan?.profile.name,
        preferredRows: attemptPlan?.preferredRows ?? preferredRows,
        concurrency: attemptPlan?.concurrency ?? concurrency,
        phase: 'disposed',
        freshWorker: false,
        priorClientDisposed: true,
      })
    }
  }
}
