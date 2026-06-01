import type { MutableRefObject } from 'react'
import { useMemo } from 'react'

import type { PipelineStats } from '~/lib/gl/pipeline'
import type { DecodedImage } from '~/lib/raw/decoder'

import type { ExportShareCapability } from '../../../model/export-result'
import type {
  DisplaySource,
  ExportRecoveryState,
  ImageSession,
} from '../../../model/session'
import type { ProcessingStatus } from '../../../model/workflow'
import { resolveExportShareButtonCapability } from '../../../services/export/export-result-actions'

type UseExportDerivedStateInput = {
  session: ImageSession | null
  discoveredRecovery: ExportRecoveryState
  decodedImageRef: MutableRefObject<DecodedImage | null>
  embeddedPreviewUrl: string | null
  status: ProcessingStatus
  hasImage: boolean
  displaySource: DisplaySource
  stats: PipelineStats | null
}

export function useExportDerivedState({
  session,
  discoveredRecovery,
  decodedImageRef,
  embeddedPreviewUrl,
  status,
  hasImage,
  displaySource,
  stats,
}: UseExportDerivedStateInput) {
  return useMemo(() => {
    const exportResult = session?.exportState.result ?? null
    const exportShareCapability: ExportShareCapability = exportResult
      ? resolveExportShareButtonCapability()
      : { available: false, reason: 'Export a JPEG before sharing.' }
    const sessionRecovery = session?.exportState.recovery
    const exportRecovery =
      sessionRecovery && sessionRecovery.status !== 'none'
        ? sessionRecovery
        : discoveredRecovery
    const exportState = session?.exportState
    const activeExportPlan =
      exportState?.status === 'exporting' ||
      (exportState?.status === 'ready' && exportState.result)
        ? exportState.activePlan
        : undefined
    const exportPlanSuspendsPreview = Boolean(activeExportPlan)
    const previewEvacuatedForReadyExport =
      exportState?.status === 'ready' &&
      Boolean(exportState.result) &&
      !decodedImageRef.current &&
      !embeddedPreviewUrl
    const previewSuspended =
      exportPlanSuspendsPreview &&
      (status === 'exporting' || previewEvacuatedForReadyExport)
    const hqPreviewImage = decodedImageRef.current
    const canPreviewExport =
      status === 'ready' &&
      !previewSuspended &&
      displaySource === 'bounded-hq' &&
      hqPreviewImage?.source === 'bounded-hq' &&
      Boolean(stats?.inputSize)
    const previewExportDisabledReason = !hasImage
      ? 'Load a RAW file before exporting an HQ preview JPEG.'
      : previewSuspended
        ? 'Restore the preview before exporting an HQ preview JPEG.'
        : displaySource !== 'bounded-hq' ||
            hqPreviewImage?.source !== 'bounded-hq'
          ? 'HQ preview export is available after the bounded HQ preview finishes.'
          : !stats?.inputSize
            ? 'HQ preview export is not ready.'
            : undefined

    return {
      exportResult,
      exportShareCapability,
      exportRecovery,
      previewSuspended,
      canPreviewExport,
      previewExportDisabledReason,
    }
  }, [
    decodedImageRef,
    discoveredRecovery,
    displaySource,
    embeddedPreviewUrl,
    hasImage,
    session,
    stats,
    status,
  ])
}
