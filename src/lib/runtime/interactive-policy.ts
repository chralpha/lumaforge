import type { CapabilityVector } from './capability-vector'
import type { PreviewGpuBudget } from './preview-gpu-budget'
import { deriveRuntimeResourceBudget } from './resource-budget'

export interface InteractivePolicy {
  readonly boundedHqMaxPixels: number
  readonly previewWorkerMemoryProfile: 'low-memory' | 'desktop'
  readonly allowConcurrentDecodeAndLutParse: boolean
}

export interface InteractivePolicyOptions {
  readonly previewGpuBudget?: Pick<PreviewGpuBudget, 'boundedHqMaxPixels'>
}

export function deriveInteractivePolicy(
  cap: CapabilityVector,
  options: InteractivePolicyOptions = {},
): InteractivePolicy {
  const budget = deriveRuntimeResourceBudget(cap)

  return Object.freeze({
    boundedHqMaxPixels:
      options.previewGpuBudget?.boundedHqMaxPixels ?? budget.boundedHqMaxPixels,
    previewWorkerMemoryProfile: budget.workerMemoryProfile,
    allowConcurrentDecodeAndLutParse: budget.allowConcurrentDecodeAndLutParse,
  })
}
