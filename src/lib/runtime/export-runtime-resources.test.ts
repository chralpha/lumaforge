import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  resetCapabilityVectorForTest,
  setCapabilityVectorForTest,
} from './capability-vector'
import { snapshotExportRuntimeResources } from './export-runtime-resources'

afterEach(() => {
  resetCapabilityVectorForTest()
  vi.unstubAllGlobals()
})

describe('snapshotExportRuntimeResources', () => {
  it('computes available MB from quota minus usage', async () => {
    setCapabilityVectorForTest({
      coi: true,
      pthread: true,
      deviceMemoryGB: 16,
      hwConcurrency: 8,
      webKitClass: 'chromium',
      maybeOpfsSupported: true,
    })
    vi.stubGlobal('navigator', {
      storage: {
        estimate: vi.fn(async () => ({
          quota: 1_000_000_000,
          usage: 200_000_000,
        })),
        getDirectory: vi.fn(async () => ({})),
      },
    } as never)

    const snap = await snapshotExportRuntimeResources({
      streamingSinkAvailable: true,
    })

    expect(snap.opfsSinkAvailable).toBe(true)
    expect(snap.opfsAvailableMB).toBe(800)
    expect(snap.streamingSinkAvailable).toBe(true)
  })

  it('marks opfs unavailable when capability vector says so', async () => {
    setCapabilityVectorForTest({
      coi: true,
      pthread: true,
      deviceMemoryGB: 16,
      hwConcurrency: 8,
      webKitClass: 'chromium',
      maybeOpfsSupported: false,
    })

    const snap = await snapshotExportRuntimeResources({
      streamingSinkAvailable: true,
    })

    expect(snap.opfsSinkAvailable).toBe(false)
    expect(snap.opfsAvailableMB).toBeNull()
  })
})
