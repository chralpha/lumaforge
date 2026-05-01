import type { ExportColorGraphDescriptor } from '@lumaforge/luma-color-runtime'

import type { ExportExecutionPlan } from '~/lib/export/execution-profile'
import { selectExportExecutionPlan } from '~/lib/export/execution-profile'
import type { FullResolutionExportProgress } from '~/lib/export/full-res-export'
import type { RunFullResolutionJpegExportInWorkerInput } from '~/lib/export/full-res-export-client'
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
      streamingAvailable:
        typeof WritableStream !== 'undefined' &&
        typeof ReadableStream !== 'undefined',
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
      streamingAvailable: true,
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

export async function runFullResolutionExportJob({
  file,
  filename,
  graph,
  quality,
  preferredRows,
  concurrency,
  onProgress,
  signal,
  clientFactory = createFullResolutionExportClient,
}: {
  file: File
  filename: string
  graph: ExportColorGraphDescriptor
  quality?: RunFullResolutionJpegExportInWorkerInput['quality']
  preferredRows?: RunFullResolutionJpegExportInWorkerInput['preferredRows']
  concurrency?: RunFullResolutionJpegExportInWorkerInput['concurrency']
  onProgress?: (progress: FullResolutionExportProgress) => void
  signal?: AbortSignal
  clientFactory?: () => FullResolutionExportWorkerClient
}) {
  const client = clientFactory()

  try {
    const output = await client.run({
      file,
      graph,
      quality,
      preferredRows,
      concurrency,
      onProgress,
      signal,
    })

    return { filename, output }
  } finally {
    client.dispose()
  }
}
