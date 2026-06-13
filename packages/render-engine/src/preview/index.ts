// `@lumaforge/render-engine/preview` subpath entry.
//
// P4a (this phase) ships the migrated CPU preview path:
// preview-render.ts (was cpu-preview-frame.ts), preview-plan.ts (was
// preview-resolution-policy.ts), and the worker-bridge module (CPU
// preview Worker abstraction). P4b adds the net-new candidate-render +
// contact-sheet primitives on top of these.

export {
  BOUNDED_HQ_PREVIEW_MAX_PIXELS,
  type BoundedHqPreviewTarget,
  createProgressivePreviewPlan,
  decideBoundedHqPreview,
  type ProgressivePreviewPlan,
  QUICK_PREVIEW_MAX_PIXELS,
  type QuickPreviewTarget,
} from './preview-plan'
export {
  renderCpuPreviewFrame,
  type RenderCpuPreviewFrameInput,
} from './preview-render'
export {
  CpuPreviewClient,
  type CpuPreviewFrame,
  type CpuPreviewWorkerLike,
} from './worker-bridge/bridge'
export type {
  CpuPreviewFailureReason,
  CpuPreviewRequest,
  CpuPreviewResponse,
  CpuPreviewVariant,
} from './worker-bridge/protocol'
