import type { ExportColorGraphDescriptor } from '@lumaforge/luma-color-runtime'

import type {
  LargeResourceOwner,
  ResourceRegistry,
  ResourceRegistryCheck,
} from '~/lib/export/resource-registry'

export type PreExportSnapshot = {
  file: File
  metadata: unknown
  graph?: ExportColorGraphDescriptor
  graphFingerprint: string
  lutTitle?: string
  quickPreviewReady: boolean
  tone: unknown
  style: unknown
}

export type ExportEvacuationResult = {
  snapshot: PreExportSnapshot
  registryCheck: ResourceRegistryCheck
  evacuatedAt: string
}

const PRE_EXPORT_DISPOSABLE_OWNERS: LargeResourceOwner[] = [
  'preview',
  'bounded-hq',
  'webgl',
  'export-result',
  'lut-fetch',
]

export function createPreExportSnapshot(
  input: PreExportSnapshot,
): PreExportSnapshot {
  return { ...input }
}

export async function evacuateBeforeExport(input: {
  registry: ResourceRegistry
  snapshot: PreExportSnapshot
  abortPreview: () => void
  abortBoundedHq: () => void
  releasePreviousExportResult: () => void
}): Promise<ExportEvacuationResult> {
  input.abortPreview()
  input.abortBoundedHq()
  input.releasePreviousExportResult()

  await input.registry.disposeOwners(PRE_EXPORT_DISPOSABLE_OWNERS)
  const registryCheck = input.registry.assertZeroLive(
    PRE_EXPORT_DISPOSABLE_OWNERS,
  )

  return {
    snapshot: input.snapshot,
    registryCheck,
    evacuatedAt: new Date().toISOString(),
  }
}
