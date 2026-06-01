import { describe, expect, it } from 'vitest'

import type { CapabilityVector } from './capability-vector'
import { deriveRuntimeResourceBudget } from './resource-budget'

const baseCap: CapabilityVector = {
  coi: true,
  pthread: true,
  deviceMemoryGB: 16,
  hwConcurrency: 8,
  webKitClass: 'chromium',
  deviceFormFactor: 'desktop',
  maybeOpfsSupported: true,
}

describe('deriveRuntimeResourceBudget', () => {
  it('keeps Chromium desktop on the performance budget', () => {
    expect(deriveRuntimeResourceBudget(baseCap)).toMatchObject({
      resourceClass: 'desktop-performance',
      boundedHqMaxPixels: 16_000_000,
      workerMemoryProfile: 'desktop',
      exportRowSliceCeiling: 2048,
      exportConcurrencyCeiling: 3,
    })
  })

  it('gives strong WebKit mobile 12MP preview while keeping export single-worker', () => {
    expect(
      deriveRuntimeResourceBudget({
        ...baseCap,
        deviceMemoryGB: null,
        webKitClass: 'webkit-mobile',
        deviceFormFactor: 'mobile',
      }),
    ).toMatchObject({
      resourceClass: 'balanced-preview',
      boundedHqMaxPixels: 12_000_000,
      workerMemoryProfile: 'low-memory',
      exportRowSliceCeiling: 128,
      exportConcurrencyCeiling: 1,
    })
  })

  it('uses the low-memory budget when threads or known memory headroom are absent', () => {
    expect(
      deriveRuntimeResourceBudget({
        ...baseCap,
        pthread: false,
        deviceMemoryGB: 2,
        webKitClass: 'webkit-mobile',
        deviceFormFactor: 'mobile',
      }),
    ).toMatchObject({
      resourceClass: 'mobile-safe',
      boundedHqMaxPixels: 8_000_000,
      workerMemoryProfile: 'low-memory',
      exportRowSliceCeiling: 128,
      exportConcurrencyCeiling: 1,
    })
  })

  it('gives strong Chromium mobile a larger HQ preview without desktop workers', () => {
    expect(
      deriveRuntimeResourceBudget({
        ...baseCap,
        deviceMemoryGB: 8,
        webKitClass: 'chromium',
        deviceFormFactor: 'mobile',
      }),
    ).toMatchObject({
      resourceClass: 'balanced-preview',
      boundedHqMaxPixels: 12_000_000,
      workerMemoryProfile: 'low-memory',
      exportRowSliceCeiling: 256,
      exportConcurrencyCeiling: 1,
      allowConcurrentDecodeAndLutParse: false,
    })
  })

  it('keeps unknown mobile engines single-worker even when preview can be balanced', () => {
    expect(
      deriveRuntimeResourceBudget({
        ...baseCap,
        deviceMemoryGB: null,
        webKitClass: 'unknown',
        deviceFormFactor: 'mobile',
      }),
    ).toMatchObject({
      resourceClass: 'balanced-preview',
      boundedHqMaxPixels: 12_000_000,
      workerMemoryProfile: 'low-memory',
      exportRowSliceCeiling: 128,
      exportConcurrencyCeiling: 1,
      allowConcurrentDecodeAndLutParse: false,
    })
  })

  it('keeps known-low-memory desktops off the desktop worker budget', () => {
    expect(
      deriveRuntimeResourceBudget({
        ...baseCap,
        deviceMemoryGB: 4,
      }),
    ).toMatchObject({
      resourceClass: 'compat-safe',
      boundedHqMaxPixels: 8_000_000,
      workerMemoryProfile: 'low-memory',
      exportRowSliceCeiling: 128,
      exportConcurrencyCeiling: 1,
      allowConcurrentDecodeAndLutParse: false,
    })
  })

  it('does not treat touch-capable desktop Chromium as mobile', () => {
    expect(
      deriveRuntimeResourceBudget({
        ...baseCap,
        deviceFormFactor: 'desktop',
      }),
    ).toMatchObject({
      resourceClass: 'desktop-performance',
      workerMemoryProfile: 'desktop',
      exportRowSliceCeiling: 2048,
      exportConcurrencyCeiling: 3,
    })
  })
})
