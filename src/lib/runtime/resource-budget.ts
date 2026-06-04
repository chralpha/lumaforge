import {
  BOUNDED_HQ_PREVIEW_LOW_MEMORY_MAX_PIXELS,
  BOUNDED_HQ_PREVIEW_MAX_PIXELS,
  QUICK_PREVIEW_MAX_PIXELS,
} from '~/lib/raw/decoder'

import type { CapabilityVector } from './capability-vector'

export type RuntimeResourceClass =
  | 'desktop-performance'
  | 'balanced-preview'
  | 'mobile-safe'
  | 'compat-safe'

export interface RuntimeResourceBudget {
  readonly resourceClass: RuntimeResourceClass
  readonly boundedHqMaxPixels: number
  readonly workerMemoryProfile: 'low-memory' | 'desktop'
  readonly exportRowSliceCeiling: number
  readonly exportConcurrencyCeiling: number
  readonly allowConcurrentDecodeAndLutParse: boolean
}

const DESKTOP_HQ_MAX_PIXELS = 16_000_000

function hasKnownLowMemory(cap: CapabilityVector) {
  return cap.deviceMemoryGB != null && cap.deviceMemoryGB <= 4
}

function capByDeviceMemory(pixels: number, cap: CapabilityVector) {
  if (cap.deviceMemoryGB == null) return pixels

  return Math.min(
    pixels,
    Math.max(
      QUICK_PREVIEW_MAX_PIXELS,
      Math.floor(cap.deviceMemoryGB * 4_000_000),
    ),
  )
}

function canUseDesktopMemory(cap: CapabilityVector) {
  return (
    cap.coi &&
    cap.pthread &&
    cap.webKitClass === 'chromium' &&
    cap.deviceFormFactor === 'desktop' &&
    !hasKnownLowMemory(cap)
  )
}

function isMobileFormFactor(cap: CapabilityVector) {
  return (
    cap.deviceFormFactor === 'mobile' || cap.webKitClass === 'webkit-mobile'
  )
}

function canUseBalancedPreview(cap: CapabilityVector) {
  return (
    cap.coi &&
    cap.pthread &&
    cap.hwConcurrency >= 6 &&
    !hasKnownLowMemory(cap) &&
    (isMobileFormFactor(cap) || cap.webKitClass === 'webkit-desktop-safari')
  )
}

function canUseBalancedMobileExport(cap: CapabilityVector) {
  return (
    isMobileFormFactor(cap) &&
    cap.webKitClass === 'chromium' &&
    cap.pthread &&
    cap.hwConcurrency >= 6 &&
    cap.deviceMemoryGB != null &&
    cap.deviceMemoryGB >= 8
  )
}

export function deriveRuntimeResourceBudget(
  cap: CapabilityVector,
): RuntimeResourceBudget {
  const knownLowMemory = hasKnownLowMemory(cap)
  const desktopMemory = canUseDesktopMemory(cap)
  const balancedPreview = canUseBalancedPreview(cap)
  const mobileFormFactor = isMobileFormFactor(cap)

  const workerMemoryProfile = desktopMemory ? 'desktop' : 'low-memory'
  const resourceClass: RuntimeResourceClass = desktopMemory
    ? 'desktop-performance'
    : balancedPreview
      ? 'balanced-preview'
      : mobileFormFactor
        ? 'mobile-safe'
        : 'compat-safe'

  const boundedHqBasePixels = desktopMemory
    ? DESKTOP_HQ_MAX_PIXELS
    : balancedPreview
      ? BOUNDED_HQ_PREVIEW_MAX_PIXELS
      : BOUNDED_HQ_PREVIEW_LOW_MEMORY_MAX_PIXELS

  let exportRowSliceCeiling = 2048
  if (cap.webKitClass === 'webkit-mobile' || knownLowMemory) {
    exportRowSliceCeiling = 128
  } else if (mobileFormFactor) {
    exportRowSliceCeiling = canUseBalancedMobileExport(cap) ? 256 : 128
  } else if (!cap.pthread || cap.webKitClass === 'webkit-desktop-safari') {
    exportRowSliceCeiling = 256
  }

  const exportConcurrencyCeiling =
    cap.pthread &&
    !mobileFormFactor &&
    !knownLowMemory &&
    cap.webKitClass !== 'webkit-mobile' &&
    cap.webKitClass !== 'webkit-desktop-safari'
      ? 3
      : 1

  return Object.freeze({
    resourceClass,
    boundedHqMaxPixels: capByDeviceMemory(boundedHqBasePixels, cap),
    workerMemoryProfile,
    exportRowSliceCeiling,
    exportConcurrencyCeiling,
    allowConcurrentDecodeAndLutParse:
      cap.pthread &&
      cap.hwConcurrency >= 4 &&
      !mobileFormFactor &&
      !knownLowMemory,
  })
}
