import { createLumaRawRuntime } from '@lumaforge/luma-raw-runtime'

import { createRawExportSession } from '../raw/export-runtime-adapter'
import { runFullResolutionJpegExport } from './full-res-export'
import type {
  FullResExportWorkerRequest,
  FullResExportWorkerResponse,
} from './full-res-export-client'

type ProcessedWindowExportLifecycleInput<Result> = {
  beginProcessedWindowExport?: (signal?: AbortSignal) => Promise<unknown>
  endProcessedWindowExport?: (signal?: AbortSignal) => Promise<unknown>
  runExport: () => Promise<Result>
  signal?: AbortSignal
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'FULL_RES_EXPORT_FAILED'
}

const activeRequests = new Map<string, AbortController>()

export async function runProcessedWindowExportLifecycle<Result>({
  beginProcessedWindowExport,
  endProcessedWindowExport,
  runExport,
  signal,
}: ProcessedWindowExportLifecycleInput<Result>): Promise<Result> {
  let processedWindowExportActive = false

  if (beginProcessedWindowExport) {
    await beginProcessedWindowExport(signal)
    processedWindowExportActive = true
  }

  let primaryError: unknown
  let cleanupError: unknown
  let hasPrimaryError = false
  let result: Result

  try {
    result = await runExport()
  } catch (error) {
    primaryError = error
    hasPrimaryError = true
  }

  if (processedWindowExportActive && endProcessedWindowExport) {
    try {
      await endProcessedWindowExport()
    } catch (error) {
      cleanupError = error
    }
  }

  if (hasPrimaryError) {
    throw primaryError
  }

  if (cleanupError !== undefined) {
    throw cleanupError
  }

  return result!
}

async function handleStart(
  message: Extract<FullResExportWorkerRequest, { kind: 'start' }>,
) {
  const controller = new AbortController()
  activeRequests.set(message.requestId, controller)
  const runtime = createLumaRawRuntime({
    requireCrossOriginIsolation: true,
  })

  try {
    await runtime.init()
    const session = await runtime.openSession(
      message.file,
      undefined,
      controller.signal,
    )
    try {
      const exportSession = createRawExportSession(session)
      const capability = await exportSession.probeExportCapability(
        controller.signal,
      )
      const blob = await runProcessedWindowExportLifecycle({
        beginProcessedWindowExport: exportSession.beginProcessedWindowExport,
        endProcessedWindowExport: exportSession.endProcessedWindowExport,
        signal: controller.signal,
        runExport() {
          return runFullResolutionJpegExport({
            capability,
            graph: message.graph,
            preferredRows: message.preferredRows,
            quality: message.quality,
            signal: controller.signal,
            readProcessedWindow: exportSession.readProcessedWindow,
            onProgress(progress) {
              self.postMessage({
                kind: 'progress',
                requestId: message.requestId,
                progress,
              } satisfies FullResExportWorkerResponse)
            },
            ...(message.collectMetrics
              ? {
                  metricContext: {
                    requestId: message.requestId,
                    fileName: message.file.name,
                    browser: globalThis.navigator?.userAgent,
                  },
                  onMetric(metric) {
                    self.postMessage({
                      kind: 'metric',
                      requestId: message.requestId,
                      metric,
                    } satisfies FullResExportWorkerResponse)
                  },
                }
              : {}),
          })
        },
      })

      self.postMessage({
        kind: 'success',
        requestId: message.requestId,
        blob,
      } satisfies FullResExportWorkerResponse)
    } finally {
      session.dispose()
    }
  } catch (error) {
    self.postMessage({
      kind: 'error',
      requestId: message.requestId,
      message: toErrorMessage(error),
    } satisfies FullResExportWorkerResponse)
  } finally {
    activeRequests.delete(message.requestId)
    runtime.dispose()
  }
}

self.onmessage = (event: MessageEvent<FullResExportWorkerRequest>) => {
  const message = event.data

  if (message.kind === 'cancel') {
    activeRequests.get(message.requestId)?.abort()
    return
  }

  void handleStart(message)
}

export {}
