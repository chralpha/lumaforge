import type { CapabilityVector } from './capability-vector'
import { deriveRuntimeResourceBudget } from './resource-budget'

export interface InteractivePolicy {
  readonly boundedHqMaxPixels: number
  readonly previewWorkerMemoryProfile: 'low-memory' | 'desktop'
  readonly allowConcurrentDecodeAndLutParse: boolean
}

export function deriveInteractivePolicy(
  cap: CapabilityVector,
): InteractivePolicy {
  const budget = deriveRuntimeResourceBudget(cap)

  return Object.freeze({
    boundedHqMaxPixels: budget.boundedHqMaxPixels,
    previewWorkerMemoryProfile: budget.workerMemoryProfile,
    allowConcurrentDecodeAndLutParse: budget.allowConcurrentDecodeAndLutParse,
  })
}
