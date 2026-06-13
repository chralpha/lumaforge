// PreviewGpuBudget — type-only mirror of `src/lib/runtime/preview-gpu-budget.ts`.
//
// The DOM-bound DETECTION (WebGL2 probing, canvas size queries) stays in
// `src/`. The engine's policy decisions (interactive-policy.ts) take the
// derived budget as input, so the engine only needs the shape here.

export interface PreviewGpuCapabilitySnapshot {
  readonly webgl2: boolean
  readonly maxTextureSize: number
  readonly maxRenderbufferSize: number
}

export interface PreviewGpuBudget {
  readonly boundedHqMaxPixels: number
  readonly dualWebglAllowed: boolean
  readonly originalReferenceSnapshotMaxPixels: number
}
