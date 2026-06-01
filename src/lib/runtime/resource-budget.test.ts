import { describe, expect, it } from 'vitest'

import type { CapabilityVector } from './capability-vector'
import { deriveRuntimeResourceBudget } from './resource-budget'

const baseCap: CapabilityVector = {
  coi: true,
  pthread: true,
  deviceMemoryGB: 16,
  hwConcurrency: 8,
  webKitClass: 'chromium',
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
      }),
    ).toMatchObject({
      resourceClass: 'webkit-balanced',
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
      }),
    ).toMatchObject({
      resourceClass: 'mobile-safe',
      boundedHqMaxPixels: 8_000_000,
      workerMemoryProfile: 'low-memory',
      exportRowSliceCeiling: 128,
      exportConcurrencyCeiling: 1,
    })
  })
})
