export type RawPreviewCapability =
  | { supportStatus: 'unsupported'; previewMode: null; reason: 'coi-missing' }
  | {
      supportStatus: 'degraded'
      previewMode: 'cpu'
      reason: 'webgl2-missing' | 'tone-float-precision-low'
    }
  | { supportStatus: 'supported'; previewMode: 'gpu'; reason: null }

export type RawPreviewGpuFacts = {
  webgl2: boolean
  toneHighPrecision: boolean
}

/**
 * Pure preview-capability decision. RAW runtime memory-profile selection is
 * handled by the runtime policy layer; this gate only decides whether the
 * interactive preview can use GPU or must degrade to CPU.
 */
export function resolveRawPreviewCapability(
  gpu: RawPreviewGpuFacts,
  _crossOriginIsolated?: boolean,
): RawPreviewCapability {
  if (!gpu.webgl2) {
    return {
      supportStatus: 'degraded',
      previewMode: 'cpu',
      reason: 'webgl2-missing',
    }
  }
  if (!gpu.toneHighPrecision) {
    return {
      supportStatus: 'degraded',
      previewMode: 'cpu',
      reason: 'tone-float-precision-low',
    }
  }
  return { supportStatus: 'supported', previewMode: 'gpu', reason: null }
}
