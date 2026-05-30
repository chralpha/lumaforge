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
 * Pure preview-capability decision. COI gates RAW decode itself (the runtime
 * hard-gates on it), so missing COI is always unsupported. With COI present, an
 * insufficient GPU degrades to the CPU preview instead of hard-failing.
 */
export function resolveRawPreviewCapability(
  gpu: RawPreviewGpuFacts,
  crossOriginIsolated: boolean,
): RawPreviewCapability {
  if (!crossOriginIsolated) {
    return {
      supportStatus: 'unsupported',
      previewMode: null,
      reason: 'coi-missing',
    }
  }
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
