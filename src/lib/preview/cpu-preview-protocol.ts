import type { SupportedExportColorGraphDescriptor } from '@lumaforge/luma-color-runtime'

export type CpuPreviewVariant = 'processed' | 'neutral'

export type CpuPreviewFailureReason =
  | 'worker-construction-failed'
  | 'worker-module-load-failed'
  | 'source-transfer-failed'
  | 'invalid-source-buffer'
  | 'render-failed'
  | 'out-of-memory'

export type CpuPreviewRequest =
  | {
      type: 'loadSource'
      sourceId: string
      width: number
      height: number
      data: Uint16Array
    }
  | {
      type: 'render'
      sourceId: string
      requestId: number
      graph: SupportedExportColorGraphDescriptor
      variant: CpuPreviewVariant
    }
  | { type: 'disposeSource'; sourceId: string }

export type CpuPreviewResponse =
  | {
      type: 'rendered'
      sourceId: string
      requestId: number
      rgba: Uint8ClampedArray
      width: number
      height: number
    }
  | {
      type: 'error'
      sourceId: string
      requestId?: number
      reason: CpuPreviewFailureReason
    }
