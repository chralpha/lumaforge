import type { LumaRawErrorCode } from './errors'
import type {
  LumaEmbeddedPreview,
  LumaRawFrame,
  LumaRawProbe,
  LumaRawRuntimeInfo,
} from './types'

export type LumaRawWorkerRequestType =
  | 'init'
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

export type LumaRawWorkerRequestPayloadByType = {
  init: { requireCrossOriginIsolation: boolean }
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
