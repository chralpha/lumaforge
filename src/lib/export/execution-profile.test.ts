import type {ExportExecutionProfileName} from './execution-profile';
import {
  getExportModeCopy,
  selectExportExecutionPlan
} from './execution-profile'

describe('export execution profile selection', () => {
  it('forces ios-safe after interrupted checkpoint regardless of platform', () => {
    const plan = selectExportExecutionPlan({
      fidelity: 'max',
      sourceWidth: 11662,
      sourceHeight: 8746,
      previousInterrupted: true,
      runtime: { lowMemoryAvailable: true, pthreadAvailable: true },
      output: { opfsAvailable: true, streamingAvailable: true },
      platform: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', touch: false },
    })

    expect(plan.profile.name).toBe('ios-safe')
    expect(plan.preferredRows).toBe(64)
    expect(plan.concurrency).toBe(1)
    expect(plan.runtimeMemoryProfile).toBe('low-memory')
    expect(plan.checkpointMode).toBe('safe-retry')
    expect(plan.outputSink).toBe('opfs-file')
  })

  it('uses ios-safe for iPhone WebKit-like environments', () => {
    const plan = selectExportExecutionPlan({
      fidelity: 'balanced',
      sourceWidth: 11662,
      sourceHeight: 8746,
      runtime: { lowMemoryAvailable: true, pthreadAvailable: true },
      output: { opfsAvailable: true, streamingAvailable: false },
      platform: {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        touch: true,
      },
    })

    expect(plan.profile.name).toBe('ios-safe')
    expect(plan.maxConcurrency).toBe(1)
    expect(plan.preferredRows).toBe(64)
  })

  it.each([
    ['mobile-balanced', 256, 2],
    ['desktop-fast', 1024, 3],
  ] as Array<[ExportExecutionProfileName, number, number]>)(
    'keeps non-iOS %s throughput defaults',
    (expectedProfile, expectedRows, expectedConcurrency) => {
      const plan = selectExportExecutionPlan({
        fidelity: expectedProfile === 'desktop-fast' ? 'max' : 'balanced',
        sourceWidth: expectedProfile === 'desktop-fast' ? 9504 : 6000,
        sourceHeight: expectedProfile === 'desktop-fast' ? 6336 : 4000,
        runtime: { lowMemoryAvailable: true, pthreadAvailable: true },
        output: { opfsAvailable: false, streamingAvailable: true },
        platform: {
          userAgent:
            expectedProfile === 'desktop-fast'
              ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/126 Safari/537.36'
              : 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
          touch: expectedProfile !== 'desktop-fast',
          hardwareConcurrency: 8,
        },
      })

      expect(plan.profile.name).toBe(expectedProfile)
      expect(plan.preferredRows).toBe(expectedRows)
      expect(plan.concurrency).toBe(expectedConcurrency)
    },
  )

  it('maps product copy without saying resume for safe retry', () => {
    expect(getExportModeCopy('interrupted-source-needed')).toBe(
      'The browser interrupted the previous export. Please reselect the same RAW file so LumaForge can retry with a safer setting.',
    )
    expect(getExportModeCopy('interrupted-source-needed')).not.toMatch(
      /resume/i,
    )
  })
})
