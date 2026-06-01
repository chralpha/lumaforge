import type { DisplaySource } from '../../model/session'

export type OriginalReferenceSnapshot = {
  key: string
  objectUrl: string
  width: number
  height: number
  source: Extract<DisplaySource, 'quick' | 'bounded-hq'>
  mimeType: 'image/jpeg'
  estimatedBytes: number
}

export type OriginalReferenceSnapshotKeyInput = {
  sessionId: string
  displaySource: Extract<DisplaySource, 'quick' | 'bounded-hq'>
  imageVersion: number
  width: number
  height: number
  renderExposureEv: number
  policyVersion: number
  ignored?: Record<string, unknown>
}

export type SnapshotCapabilityPolicyInput = {
  displaySourcePixels: number
  webKitClass:
    | 'chromium'
    | 'webkit-desktop-safari'
    | 'webkit-mobile'
    | 'unknown'
  pthread: boolean
}

const releasedSnapshotUrls = new Set<string>()

export function createOriginalReferenceSnapshotKey({
  sessionId,
  displaySource,
  imageVersion,
  width,
  height,
  renderExposureEv,
  policyVersion,
}: OriginalReferenceSnapshotKeyInput): string {
  return [
    'original-reference',
    `policy:${policyVersion}`,
    `session:${sessionId}`,
    `source:${displaySource}`,
    `version:${imageVersion}`,
    `size:${width}x${height}`,
    `renderExposure:${Number.isFinite(renderExposureEv) ? renderExposureEv : 0}`,
  ].join('|')
}

export function getOriginalReferenceSnapshotMaxPixels({
  displaySourcePixels,
  webKitClass,
  pthread,
}: SnapshotCapabilityPolicyInput): number {
  const policyCap =
    webKitClass === 'webkit-mobile' || !pthread
      ? 2_500_000
      : webKitClass === 'webkit-desktop-safari'
        ? 4_000_000
        : 8_000_000

  return Math.max(1, Math.min(displaySourcePixels, policyCap))
}

export function releaseOriginalReferenceSnapshot(
  snapshot: OriginalReferenceSnapshot | null | undefined,
  {
    revokeObjectURL,
  }: {
    revokeObjectURL?: (url: string) => void
  } = {},
): void {
  if (!snapshot || releasedSnapshotUrls.has(snapshot.objectUrl)) return
  releasedSnapshotUrls.add(snapshot.objectUrl)
  const revoke =
    revokeObjectURL ??
    (typeof URL.revokeObjectURL === 'function'
      ? URL.revokeObjectURL.bind(URL)
      : undefined)
  revoke?.(snapshot.objectUrl)
}
