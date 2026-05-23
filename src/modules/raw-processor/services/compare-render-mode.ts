import type { ProcessingParams } from '@lumaforge/luma-color-runtime'

export type CompareRenderMode =
  | { kind: 'off' }
  | { kind: 'dual-webgl' }
  | {
      kind: 'jpeg-fallback'
      reason: 'dual-webgl-unavailable' | 'original-webgl-failed'
    }
  | {
      kind: 'processed-only'
      reason:
        | 'not-compare'
        | 'css-clip-unavailable'
        | 'jpeg-fallback-unavailable'
    }

export type SelectCompareRenderModeInput = {
  requestedViewMode: ProcessingParams['viewMode']
  supportsCssClip: boolean
  dualWebglAllowed: boolean
  originalWebglReady: boolean
  originalWebglFailed?: boolean
  jpegSnapshotReady: boolean
}

export function supportsLayeredCompareCss(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
    return true
  }

  return (
    CSS.supports('clip-path', 'inset(0 50% 0 0)') ||
    CSS.supports('-webkit-clip-path', 'inset(0 50% 0 0)')
  )
}

export function selectCompareRenderMode({
  requestedViewMode,
  supportsCssClip,
  dualWebglAllowed,
  originalWebglReady,
  originalWebglFailed = false,
  jpegSnapshotReady,
}: SelectCompareRenderModeInput): CompareRenderMode {
  if (requestedViewMode !== 'compare') return { kind: 'off' }
  if (!supportsCssClip) {
    return { kind: 'processed-only', reason: 'css-clip-unavailable' }
  }
  if (dualWebglAllowed && originalWebglReady) return { kind: 'dual-webgl' }
  if (jpegSnapshotReady) {
    return {
      kind: 'jpeg-fallback',
      reason: originalWebglFailed
        ? 'original-webgl-failed'
        : 'dual-webgl-unavailable',
    }
  }

  return { kind: 'processed-only', reason: 'jpeg-fallback-unavailable' }
}
