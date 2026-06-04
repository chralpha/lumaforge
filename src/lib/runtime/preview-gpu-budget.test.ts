import { describe, expect, it } from 'vitest'

import {
  BOUNDED_HQ_PREVIEW_LOW_MEMORY_MAX_PIXELS,
  BOUNDED_HQ_PREVIEW_MAX_PIXELS,
} from '~/lib/raw/decoder'

import type { CapabilityVector } from './capability-vector'
import { derivePreviewGpuBudget } from './preview-gpu-budget'

const baseCapability: CapabilityVector = {
  coi: true,
  pthread: true,
  deviceMemoryGB: null,
  hwConcurrency: 8,
  webKitClass: 'chromium',
  deviceFormFactor: 'desktop',
  maybeOpfsSupported: true,
}

const strongGpu = {
  webgl2: true,
  maxTextureSize: 8192,
  maxRenderbufferSize: 8192,
}

describe('derivePreviewGpuBudget', () => {
  it('allows 12MP bounded HQ preview on a strong GPU without requiring pthread', () => {
    expect(
      derivePreviewGpuBudget({
        capability: { ...baseCapability, pthread: false },
        gpu: strongGpu,
        sourceWidth: 6000,
        sourceHeight: 4000,
      }),
    ).toMatchObject({
      boundedHqMaxPixels: BOUNDED_HQ_PREVIEW_MAX_PIXELS,
      dualWebglAllowed: true,
      originalReferenceSnapshotMaxPixels: BOUNDED_HQ_PREVIEW_MAX_PIXELS,
    })
  })

  it('caps 3:2 sources to the largest safe pixel count for a 4096 texture limit', () => {
    expect(
      derivePreviewGpuBudget({
        capability: { ...baseCapability, pthread: false },
        gpu: {
          webgl2: true,
          maxTextureSize: 4096,
          maxRenderbufferSize: 4096,
        },
        sourceWidth: 6000,
        sourceHeight: 4000,
      }).boundedHqMaxPixels,
    ).toBe(11_184_810)
  })

  it('keeps known low-memory devices on the low-memory preview ceiling', () => {
    expect(
      derivePreviewGpuBudget({
        capability: { ...baseCapability, deviceMemoryGB: 4 },
        gpu: strongGpu,
        sourceWidth: 6000,
        sourceHeight: 4000,
      }),
    ).toMatchObject({
      boundedHqMaxPixels: BOUNDED_HQ_PREVIEW_LOW_MEMORY_MAX_PIXELS,
      dualWebglAllowed: false,
      originalReferenceSnapshotMaxPixels:
        BOUNDED_HQ_PREVIEW_LOW_MEMORY_MAX_PIXELS,
    })
  })
})
