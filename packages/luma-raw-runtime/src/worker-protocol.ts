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

export type LumaRawWorkerRequest =
  | {
      id: string
      type: 'init'
      payload: { requireCrossOriginIsolation: boolean }
    }
  | {
      id: string
      type: 'probe' | 'extractEmbeddedPreview' | 'decodeQuick' | 'decodeHq'
      payload: LumaRawWorkerFilePayload
    }
  | {
      id: string
      type: 'cancel'
      payload: { targetJobId: string }
    }

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

export type LumaRawWorkerResponse =
  | LumaRawWorkerSuccess<LumaRawWorkerRequestType>
  | LumaRawWorkerFailure<LumaRawWorkerRequestType>

export function collectTransferables(payload: unknown): Transferable[] {
  if (!payload || typeof payload !== 'object') return []

  const transferables: Transferable[] = []
  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (value instanceof ArrayBuffer) {
      transferables.push(value)
    } else if (ArrayBuffer.isView(value)) {
      transferables.push(value.buffer)
    }
  }

  return transferables
}
