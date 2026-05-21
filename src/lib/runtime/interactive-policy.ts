import type { CapabilityVector } from './capability-vector'

export interface InteractivePolicy {
  readonly boundedHqMaxPixels: number
  readonly previewWorkerMemoryProfile: 'low-memory' | 'desktop'
  readonly allowConcurrentDecodeAndLutParse: boolean
}

export function deriveInteractivePolicy(
  cap: CapabilityVector,
): InteractivePolicy {
  let boundedHqMaxPixels = 16_000_000

  if (cap.webKitClass === 'webkit-mobile' || !cap.pthread) {
    boundedHqMaxPixels = Math.min(boundedHqMaxPixels, 8_000_000)
  }

  if (cap.deviceMemoryGB != null) {
    boundedHqMaxPixels = Math.min(
      boundedHqMaxPixels,
      cap.deviceMemoryGB * 4_000_000,
    )
  }

  const previewWorkerMemoryProfile: InteractivePolicy['previewWorkerMemoryProfile'] =
    cap.coi && cap.pthread && cap.webKitClass === 'chromium'
      ? 'desktop'
      : 'low-memory'
  const allowConcurrentDecodeAndLutParse = cap.pthread && cap.hwConcurrency >= 4

  return Object.freeze({
    boundedHqMaxPixels,
    previewWorkerMemoryProfile,
    allowConcurrentDecodeAndLutParse,
  })
}
