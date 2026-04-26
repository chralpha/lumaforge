import { createLumaRawRuntime } from '@lumaforge/luma-raw-runtime'

import type {
  FullResExportWorkerRequest,
  FullResExportWorkerResponse,
} from './full-res-export-client'
import { runFullResolutionJpegExport } from './full-res-export'
import { createRawExportSession } from '../raw/export-runtime-adapter'

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'FULL_RES_EXPORT_FAILED'
}

const activeRequests = new Map<string, AbortController>()

async function handleStart(message: Extract<FullResExportWorkerRequest, { kind: 'start' }>) {
  const controller = new AbortController()
  activeRequests.set(message.requestId, controller)
  const runtime = createLumaRawRuntime({
    requireCrossOriginIsolation: true,
  })

  try {
    await runtime.init()
    const session = await runtime.openSession(message.file, undefined, controller.signal)
    try {
      const exportSession = createRawExportSession(session)
      const capability = await exportSession.probeExportCapability(controller.signal)
      const blob = await runFullResolutionJpegExport({
        capability,
        graph: message.graph,
        preferredRows: message.preferredRows,
        quality: message.quality,
        signal: controller.signal,
        readRawWindow: exportSession.readRawWindow,
        onProgress(progress) {
          self.postMessage({
            kind: 'progress',
            requestId: message.requestId,
            progress,
          } satisfies FullResExportWorkerResponse)
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
