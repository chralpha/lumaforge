import type { LumaRawErrorCode } from './errors'
import type {
  LumaEmbeddedPreview,
  LumaRawExportCapability,
  LumaRawFrame,
  LumaRawProbe,
  LumaRawProcessedWindow,
  LumaRawProcessedWindowRequest,
  LumaRawRuntimeInfo,
  LumaRawSessionInfo,
  LumaRawWindow,
  LumaRawWindowRect,
} from './types'

export type LumaRawWorkerRequestType =
  | 'init'
  | 'openSession'
  | 'extractEmbeddedPreviewFromSession'
  | 'decodeQuickFromSession'
  | 'decodeHqFromSession'
  | 'probeExportCapabilityFromSession'
  | 'readRawWindowFromSession'
  | 'readProcessedWindowFromSession'
  | 'closeSession'
  | 'probe'
  | 'extractEmbeddedPreview'
  | 'decodeQuick'
  | 'decodeHq'
  | 'cancel'

export type LumaRawWorkerFilePayload = {
  fileBuffer: ArrayBuffer
  fileName: string
  fileSize: number
  sessionId?: string
}

export type LumaRawWorkerSessionPayload = {
  sessionId: string
}

export type LumaRawWorkerRawWindowPayload = {
  sessionId: string
  rect: LumaRawWindowRect
}

export type LumaRawWorkerProcessedWindowPayload = {
  sessionId: string
  request: LumaRawProcessedWindowRequest
}

export type LumaRawWorkerQuickSessionPayload = {
  sessionId: string
  maxOutputPixels?: number
}

export type LumaRawWorkerRequestPayloadByType = {
  init: { requireCrossOriginIsolation: boolean }
  openSession: LumaRawWorkerFilePayload & { maxOutputPixels?: number }
  extractEmbeddedPreviewFromSession: LumaRawWorkerSessionPayload
  decodeQuickFromSession: LumaRawWorkerQuickSessionPayload
  decodeHqFromSession: LumaRawWorkerSessionPayload
  probeExportCapabilityFromSession: LumaRawWorkerSessionPayload
  readRawWindowFromSession: LumaRawWorkerRawWindowPayload
  readProcessedWindowFromSession: LumaRawWorkerProcessedWindowPayload
  closeSession: LumaRawWorkerSessionPayload
  probe: LumaRawWorkerFilePayload
  extractEmbeddedPreview: LumaRawWorkerFilePayload
  decodeQuick: LumaRawWorkerFilePayload
  decodeHq: LumaRawWorkerFilePayload
  cancel: { targetJobId: string }
}

export type LumaRawWorkerRequest<
  T extends LumaRawWorkerRequestType = LumaRawWorkerRequestType,
> = {
  [K in T]: {
    id: string
    type: K
    payload: LumaRawWorkerRequestPayloadByType[K]
  }
}[T]

export type LumaRawWorkerPayloadByType = {
  init: LumaRawRuntimeInfo
  openSession: LumaRawSessionInfo
  extractEmbeddedPreviewFromSession: LumaEmbeddedPreview | null
  decodeQuickFromSession: LumaRawFrame
  decodeHqFromSession: LumaRawFrame
  probeExportCapabilityFromSession: LumaRawExportCapability
  readRawWindowFromSession: LumaRawWindow
  readProcessedWindowFromSession: LumaRawProcessedWindow
  closeSession: { closed: true }
  probe: LumaRawProbe
  extractEmbeddedPreview: LumaEmbeddedPreview | null
  decodeQuick: LumaRawFrame
  decodeHq: LumaRawFrame
  cancel: { cancelled: true }
}

export type LumaRawWorkerSuccess<T extends LumaRawWorkerRequestType> = {
  id: string
  ok: true
  type: T
  payload: LumaRawWorkerPayloadByType[T]
}

export type LumaRawWorkerFailure<T extends LumaRawWorkerRequestType> = {
  id: string
  ok: false
  type: T
  error: {
    code: LumaRawErrorCode
    message: string
  }
}

export type LumaRawWorkerResponse = {
  [T in LumaRawWorkerRequestType]:
    | LumaRawWorkerSuccess<T>
    | LumaRawWorkerFailure<T>
}[LumaRawWorkerRequestType]

export function collectTransferables(payload: unknown): Transferable[] {
  if (!payload || typeof payload !== 'object') return []

  const transferables: Transferable[] = []
  const seenBuffers = new Set<ArrayBuffer>()
  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (value instanceof ArrayBuffer) {
      if (!seenBuffers.has(value)) {
        seenBuffers.add(value)
        transferables.push(value)
      }
    } else if (
      ArrayBuffer.isView(value) &&
      value.buffer instanceof ArrayBuffer
    ) {
      if (!seenBuffers.has(value.buffer)) {
        seenBuffers.add(value.buffer)
        transferables.push(value.buffer)
      }
    }
  }

  return transferables
}
