import { describe, expect, it, vi } from 'vitest'

import type { ExportCheckpointManifest } from '~/lib/export/checkpoint-store'
import { sourceFingerprintMatches } from '~/lib/export/source-fingerprint'

import {
  createInterruptedExportRecovery,
  validateRecoveryReselection,
} from './export-recovery'

vi.mock('~/lib/export/source-fingerprint', () => ({
  sourceFingerprintMatches: vi.fn(),
}))

function manifest(): ExportCheckpointManifest {
  return {
    version: 1,
    exportId: 'export-1',
    sourceFingerprint: {
      name: 'frame.RAF',
      size: 3,
      lastModified: 123,
      hashPrefixHex: 'abc',
    },
    fileName: 'frame.RAF',
    sourceSize: 3,
    sourceLastModified: 123,
    outputWidth: 11662,
    outputHeight: 8746,
    graphFingerprint: 'graph-1',
    profile: 'ios-safe',
    attempt: 1,
    preferredRows: 64,
    totalRows: 8746,
    recoveryMode: 'safe-retry',
    outputSink: 'opfs-file',
    sourceReacquisition: 'user-reselect-required',
    completedRowsForDiagnostics: 64,
    jpegState: 'restart-required',
    updatedAt: '2026-05-01T00:00:00.000Z',
  }
}

describe('export recovery', () => {
  it('creates source-required copy without saying resume', () => {
    const checkpointManifest = manifest()
    const recovery = createInterruptedExportRecovery(checkpointManifest)

    expect(recovery.status).toBe('source-required')
    expect(recovery.message).toBe(
      'The browser interrupted the previous export. Please reselect the same RAW file so LumaForge can retry with a safer setting.',
    )
    expect(recovery.message).toMatch(/reselect the same RAW file/i)
    expect(recovery.message).toMatch(/retry/i)
    expect(recovery.message).not.toMatch(/resume/i)
    expect(recovery).toEqual(
      expect.objectContaining({
        exportId: 'export-1',
        expectedFileName: 'frame.RAF',
        manifest: checkpointManifest,
      }),
    )
  })

  it('accepts a reselected matching source', async () => {
    const checkpointManifest = manifest()
    vi.mocked(sourceFingerprintMatches).mockResolvedValue(true)

    await expect(
      validateRecoveryReselection(
        new File(['raw'], 'frame.RAF'),
        checkpointManifest,
      ),
    ).resolves.toEqual({ ok: true })

    expect(sourceFingerprintMatches).toHaveBeenCalledWith(
      expect.any(File),
      checkpointManifest.sourceFingerprint,
      {
        width: 11662,
        height: 8746,
      },
    )
  })

  it('rejects a mismatched reselected source with product-safe reason', async () => {
    vi.mocked(sourceFingerprintMatches).mockResolvedValue(false)

    await expect(
      validateRecoveryReselection(new File(['other'], 'other.RAF'), manifest()),
    ).resolves.toEqual({
      ok: false,
      reason: 'The selected RAW does not match the interrupted export source.',
    })
  })
})
