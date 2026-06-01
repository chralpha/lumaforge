import type { ExportCheckpointManifest } from '~/lib/export/checkpoint-store'
import { sourceFingerprintMatches } from '~/lib/export/source-fingerprint'

export function createInterruptedExportRecovery(
  manifest: ExportCheckpointManifest,
) {
  return {
    status: 'source-required' as const,
    exportId: manifest.exportId,
    expectedFileName: manifest.fileName,
    manifest,
    message:
      'The browser interrupted the previous export. Please reselect the same RAW file so LumaForge can retry with a safer setting.',
  }
}

export async function validateRecoveryReselection(
  file: File,
  manifest: ExportCheckpointManifest,
) {
  const ok = await sourceFingerprintMatches(file, manifest.sourceFingerprint, {
    width: manifest.outputWidth,
    height: manifest.outputHeight,
  })

  return ok
    ? { ok: true as const }
    : {
        ok: false as const,
        reason:
          'The selected RAW does not match the interrupted export source.',
      }
}
