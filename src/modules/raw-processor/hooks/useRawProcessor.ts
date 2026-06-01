import type {
  LUTColorProfile,
  LUTData,
  PreviewHistogramState,
  ProcessingParams,
} from '@lumaforge/luma-color-runtime'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  useErrorMessageValue,
  useLutValue,
  usePipelineStatsValue,
  useProcessingParamsValue,
  useProcessingStatusValue,
  useProgressValue,
  useSetErrorMessage,
  useSetLut,
  useSetPipelineStats,
  useSetProcessingParams,
  useSetProcessingStatus,
  useSetProgress,
} from '~/atoms/raw-processor'
import { yieldToPaint } from '~/lib/dom'
import type { PipelineStats, RawProcessingPipeline } from '~/lib/gl/pipeline'
import type { ParsedLUT } from '~/lib/lut/cube-parser'
import type { OnlineLUTEntry } from '~/lib/profiles/catalog'
import type { DecodedImage, ImageMetadata } from '~/lib/raw/decoder'
import { rawRuntimeAdapter } from '~/lib/raw/runtime-adapter'

import type {
  ExportResult,
  ExportShareCapability,
} from '../model/export-result'
import type {
  DisplaySource,
  ExportRecoveryState,
  LUTContractSelectionState,
  StyleAsset,
} from '../model/session'
import type { ProcessingStatus } from '../model/workflow'
import type { OriginalReferenceSnapshot } from '../services/compare/original-reference-snapshot'
import type { PreviewViewport } from '../services/preview/preview-viewport'
import { useOriginalReferencePolicy } from './stages/compare/useOriginalReferencePolicy'
import { useOriginalReferenceSnapshotResources } from './stages/compare/useOriginalReferenceSnapshotResources'
import { useRawCompareStage } from './stages/compare/useRawCompareStage'
import { useExportDerivedState } from './stages/export/useExportDerivedState'
import { useExportGraphInvalidation } from './stages/export/useExportGraphInvalidation'
import { useExportRecoveryAction } from './stages/export/useExportRecoveryAction'
import { useExportRecoveryDiscovery } from './stages/export/useExportRecoveryDiscovery'
import { useExportRecoveryState } from './stages/export/useExportRecoveryState'
import { useExportResourceManagement } from './stages/export/useExportResourceManagement'
import { useExportResultActions } from './stages/export/useExportResultActions'
import type { FullResExportOptions } from './stages/export/useFullResExportAction'
import { useFullResExportAction } from './stages/export/useFullResExportAction'
import { useHqPreviewExportAction } from './stages/export/useHqPreviewExportAction'
import { useRawLoadAction } from './stages/ingest/useRawLoadAction'
import { useRawProcessorLifecycle } from './stages/ingest/useRawProcessorLifecycle'
import { useRawRuntimeControls } from './stages/ingest/useRawRuntimeControls'
import { useRawSessionReset } from './stages/ingest/useRawSessionReset'
import { useRawSourceState } from './stages/ingest/useRawSourceState'
import { useLutDataState } from './stages/look/useLutDataState'
import { useRawLookStage } from './stages/look/useRawLookStage'
import { useDecodedPreviewResource } from './stages/preview/useDecodedPreviewResource'
import { useEmbeddedPreviewUrlLifecycle } from './stages/preview/useEmbeddedPreviewUrlLifecycle'
import type { PreviewPipelineEvacuationHandle } from './stages/preview/usePreviewPipelineEvacuation'
import { usePreviewPipelineEvacuation } from './stages/preview/usePreviewPipelineEvacuation'
import { useRestorePreviewAfterExport } from './stages/preview/useRestorePreviewAfterExport'
import { useImageSession } from './useImageSession'
import { useOriginalReferenceSnapshot } from './useOriginalReferenceSnapshot'
import { usePreviewHistogram } from './usePreviewHistogram'
import { useRawWorkflowRefs } from './useRawWorkflowRefs'

function enqueuePostCommitTask(task: () => void) {
  setTimeout(task, 0)
}

export interface UseRawProcessorReturn {
  // State
  params: ProcessingParams
  loadedImage: { file: File | null; metadata: ImageMetadata | null }
  decodedImageRef: React.RefObject<DecodedImage | null>
  decodedImageVersion: number
  status: ProcessingStatus
  error: string | null
  progress: number
  lut: ParsedLUT | null
  lutData: LUTData | null
  lutDataRef: React.RefObject<LUTData | null>
  lutDataVersion: number
  stats: PipelineStats | null
  hasImage: boolean
  canExport: boolean
  exportDisabledReason?: string
  canPreviewExport: boolean
  previewExportDisabledReason?: string
  exportResult: ExportResult | null
  exportShareCapability: ExportShareCapability
  exportRecovery: ExportRecoveryState
  activeStyle: StyleAsset | null
  lutProfileSelection: LUTContractSelectionState | null
  activeIntensity: 'off' | 'light' | 'standard' | 'strong'
  viewMode: ProcessingParams['viewMode']
  compareSplit: number
  previewViewport: PreviewViewport
  currentLutName: string | null
  sourceFileName: string
  supportLevel: 'official' | 'experimental'
  progressRecoveryHint?: string
  embeddedPreviewUrl: string | null
  displaySource: DisplaySource
  originalReferenceSnapshot: OriginalReferenceSnapshot | null
  originalReferenceFallbackReason: string | null
  dualWebglAllowed: boolean
  histogram: PreviewHistogramState
  previewSuspended: boolean

  // Actions
  loadFile: (file: File) => Promise<void>
  loadLUT: (file: File) => Promise<void>
  loadOnlineLUT: (
    entry: OnlineLUTEntry,
    options?: { signal?: AbortSignal },
  ) => Promise<void>
  selectLUTProfile: (profile: LUTColorProfile | string) => void
  selectIntensityLevel: (level: 'off' | 'light' | 'standard' | 'strong') => void
  setViewMode: (mode: ProcessingParams['viewMode']) => void
  setCompareSplit: (split: number) => void
  setPreviewViewport: (viewport: PreviewViewport) => void
  resetPreviewViewport: () => void
  clearLUT: () => void
  setParams: (params: Partial<ProcessingParams>) => void
  setToneParams: (
    params: Partial<
      Pick<
        ProcessingParams,
        | 'userExposureEv'
        | 'userContrast'
        | 'userHighlights'
        | 'userShadows'
        | 'userWhites'
        | 'userBlacks'
      >
    >,
  ) => void
  resetTone: () => void
  setColorParams: (
    params: Partial<Pick<ProcessingParams, 'userTemperature' | 'userTint'>>,
  ) => void
  resetColor: () => void
  exportImage: (options: FullResExportOptions) => Promise<void>
  exportPreviewImage: () => Promise<void>
  recoverInterruptedExport: (file: File) => Promise<void>
  downloadExportResult: () => Promise<void>
  shareExportResult: () => Promise<void>
  copyExportResult: () => Promise<void>
  restorePreviewAfterExport: () => Promise<void>
  requestOriginalReferenceFallback: () => void
  setOriginalPreviewPipeline: (
    pipeline: PreviewPipelineEvacuationHandle | null,
  ) => void
  reset: () => void
  dismissError: () => void
  updateStats: (stats: PipelineStats) => void

  // Pipeline ref for export
  pipelineRef: React.RefObject<RawProcessingPipeline | null>
}

export function useRawProcessor(): UseRawProcessorReturn {
  const baseParams = useProcessingParamsValue()
  const setParams = useSetProcessingParams()
  const status = useProcessingStatusValue()
  const setStatus = useSetProcessingStatus()
  const error = useErrorMessageValue()
  const setError = useSetErrorMessage()
  const progress = useProgressValue()
  const setProgress = useSetProgress()
  const lut = useLutValue()
  const setLut = useSetLut()
  const stats = usePipelineStatsValue()
  const setStats = useSetPipelineStats()
  const { session, replaceFile, resetSession, setSession } = useImageSession()

  const {
    pipelineRef,
    resourceRegistryRef,
    previewCopyCanvasRef,
    sessionRef,
    embeddedPreviewUrlRef,
    isMountedRef,
    runtimeWorkSessionIdRef,
    pendingLoadSessionIdRef,
    runtimeSessionRef,
    runtimeAbortControllerRef,
    exportAbortControllerRef,
    exportGraphVersionRef,
    disposedRuntimeSessionsRef,
    decodedImageRef,
    paramsRef,
    rawRenderExposureRef,
  } = useRawWorkflowRefs({ session, initialParams: baseParams })
  const compareStage = useRawCompareStage({
    baseParams,
    session,
    sessionRef,
    setParams,
    setSession,
  })
  const [decodedImageVersion, setDecodedImageVersion] = useState(0)
  const {
    discoveredRecovery,
    discoveredRecoveryRef,
    setDiscoveredRecoveryState,
    pendingRecoveryRetry,
    setPendingRecoveryRetry,
  } = useExportRecoveryState()
  const getCurrentProcessingParams = useCallback(
    () => paramsRef.current,
    [paramsRef],
  )
  const scheduleToast = useCallback(
    (notify: () => void) => {
      // Sonner uses flushSync internally; move RAW-workspace toasts out of the
      // current commit so dev-only tooling does not crash on the same render pass.
      enqueuePostCommitTask(() => {
        if (!isMountedRef.current) {
          return
        }

        notify()
      })
    },
    [isMountedRef],
  )
  const {
    hasImage,
    loadedImage,
    sourceFileName,
    supportLevel,
    progressRecoveryHint,
    embeddedPreviewUrl,
    displaySource,
  } = useRawSourceState({ session, status })
  const rawRenderExposure =
    decodedImageRef.current?.renderExposure ?? rawRenderExposureRef.current
  const {
    viewMode,
    compareSplit,
    previewViewport,
    setViewMode,
    setCompareSplit,
    setPreviewViewport,
    resetPreviewViewport,
  } = compareStage
  const { clearSessionEmbeddedPreviewUrl, revokeCurrentEmbeddedPreviewUrl } =
    useEmbeddedPreviewUrlLifecycle({
      embeddedPreviewUrlRef,
      sessionRef,
      setSession,
    })

  const { disposeRuntimeSession, abortRuntimeWork, abortExportWork } =
    useRawRuntimeControls({
      runtimeSessionRef,
      runtimeAbortControllerRef,
      runtimeWorkSessionIdRef,
      exportAbortControllerRef,
      disposedRuntimeSessionsRef,
    })

  const {
    registerCurrentPreviewPipelineForEvacuation,
    setOriginalPreviewPipeline,
  } = usePreviewPipelineEvacuation({
    resourceRegistryRef,
    pipelineRef,
  })
  const {
    setPendingOriginalReferenceSnapshotRender,
    trackOriginalReferenceSnapshot,
  } = useOriginalReferenceSnapshotResources({ resourceRegistryRef })

  const { registerExportResultResource, queueExportResultResourceDisposal } =
    useExportResourceManagement({ resourceRegistryRef })

  const { invalidateExportGraph } = useExportGraphInvalidation({
    exportGraphVersionRef,
    previewCopyCanvasRef,
    exportAbortControllerRef,
    sessionRef,
    abortExportWork,
    queueExportResultResourceDisposal,
    setSession,
    setStatus,
    setProgress,
  })
  const { lutDataRef, lutDataVersion, setLutDataRef } = useLutDataState(lut)

  const lookStage = useRawLookStage({
    baseParams: compareStage.params,
    session,
    sessionRef,
    setSession,
    lut,
    setLut,
    setParams,
    getProcessingParams: getCurrentProcessingParams,
    lutDataRef,
    setLutDataRef,
    scheduleToast,
    invalidateExportGraph,
    setViewMode,
    setCompareSplit,
  })
  const {
    params,
    activeStyle,
    lutProfileSelection,
    activeIntensity,
    currentLutName,
    loadLUT,
    loadOnlineLUT,
    selectLUTProfile,
    selectIntensityLevel,
    clearLUT,
    setParams: handleSetParams,
    setToneParams,
    resetTone,
    setColorParams,
    resetColor,
  } = lookStage
  paramsRef.current = params
  const histogram = usePreviewHistogram({
    imageRef: decodedImageRef,
    imageVersion: decodedImageVersion,
    imageIdentity: session?.id ?? pendingLoadSessionIdRef.current ?? undefined,
    params,
    lutDataRef,
    lutDataVersion,
    displaySource,
  })

  const { setDecodedImageRef } = useDecodedPreviewResource({
    decodedImageRef,
    rawRenderExposureRef,
    resourceRegistryRef,
    setDecodedImageVersion,
    invalidateExportGraph,
  })

  useExportRecoveryDiscovery({
    setDiscoveredRecoveryState,
    setSession,
  })

  useRawProcessorLifecycle({
    isMountedRef,
    runtimeWorkSessionIdRef,
    pendingLoadSessionIdRef,
    decodedImageRef,
    previewCopyCanvasRef,
    sessionRef,
    abortExportWork,
    abortRuntimeWork,
    queueExportResultResourceDisposal,
    revokeCurrentEmbeddedPreviewUrl,
    setStatus,
    setError,
    setProgress,
    setStats,
    setSession,
  })

  const { loadFile } = useRawLoadAction({
    params,
    lut,
    activeStyle,
    setStatus,
    setError,
    setProgress,
    getProcessingParams: getCurrentProcessingParams,
    setParams,
    setSession,
    setDecodedImageVersion,
    setStats,
    setPendingRecoveryRetry,
    scheduleToast,
    replaceFile,
    abortRuntimeWork,
    abortExportWork,
    queueExportResultResourceDisposal,
    revokeCurrentEmbeddedPreviewUrl,
    clearSessionEmbeddedPreviewUrl,
    setDecodedImageRef,
    invalidateExportGraph,
    registerCurrentPreviewPipelineForEvacuation,
    disposeRuntimeSession,
    yieldToPaint,
    getPrewarmState: () => rawRuntimeAdapter.getPrewarmState(),
    prewarm: () => rawRuntimeAdapter.prewarm(),
    runtimeAbortControllerRef,
    runtimeSessionRef,
    disposedRuntimeSessionsRef,
    decodedImageRef,
    sessionRef,
    embeddedPreviewUrlRef,
    isMountedRef,
    runtimeWorkSessionIdRef,
    pendingLoadSessionIdRef,
    previewCopyCanvasRef,
  })

  const { restorePreviewAfterExport } = useRestorePreviewAfterExport({
    loadedFile: loadedImage.file,
    sessionRef,
    isMountedRef,
    runtimeAbortControllerRef,
    runtimeWorkSessionIdRef,
    runtimeSessionRef,
    setStatus,
    setProgress,
    setError,
    setSession,
    setDecodedImageRef,
    abortRuntimeWork,
    disposeRuntimeSession,
    openSession: rawRuntimeAdapter.openSession,
    scheduleToast,
    toast,
  })

  const { exportImage } = useFullResExportAction({
    setStatus,
    setError,
    setProgress,
    setSession,
    loadedImage,
    session,
    params,
    lutDataRef,
    decodedImageRef,
    stats,
    setDiscoveredRecoveryState,
    exportAbortControllerRef,
    exportGraphVersionRef,
    isMountedRef,
    sessionRef,
    pipelineRef,
    resourceRegistryRef,
    previewCopyCanvasRef,
    scheduleToast,
    abortExportWork,
    abortRuntimeWork,
    terminateRawDecodeBridge: rawRuntimeAdapter.terminateDecodeBridge,
    registerCurrentPreviewPipelineForEvacuation,
    registerExportResultResource,
    revokeCurrentEmbeddedPreviewUrl,
  })

  const {
    canExport,
    exportDisabledReason,
    exportResult,
    exportShareCapability,
    exportRecovery,
    previewSuspended,
    canPreviewExport,
    previewExportDisabledReason,
  } = useExportDerivedState({
    session,
    discoveredRecovery,
    decodedImageRef,
    embeddedPreviewUrl,
    status,
    hasImage,
    displaySource,
    sourceFile: loadedImage.file,
    rawRenderExposure,
    stats,
  })

  const { recoverInterruptedExport } = useExportRecoveryAction({
    pendingRecoveryRetry,
    setPendingRecoveryRetry,
    sessionRef,
    discoveredRecoveryRef,
    loadedFile: loadedImage.file,
    canExport,
    status,
    loadFile,
    exportImage,
    scheduleToast,
    toast,
  })

  const { downloadExportResult, shareExportResult, copyExportResult } =
    useExportResultActions({
      sessionRef,
      pipelineRef,
      previewCopyCanvasRef,
      previewSize: stats?.previewSize,
      scheduleToast,
      toast,
    })

  const { reset } = useRawSessionReset({
    runtimeWorkSessionIdRef,
    pendingLoadSessionIdRef,
    previewCopyCanvasRef,
    sessionRef,
    setPendingRecoveryRetry,
    abortExportWork,
    abortRuntimeWork,
    queueExportResultResourceDisposal,
    revokeCurrentEmbeddedPreviewUrl,
    setDecodedImageRef,
    setStatus,
    setError,
    setProgress,
    setStats,
    resetSession,
  })

  // Dismiss error
  const dismissError = useCallback(() => {
    setError(null)
    if (status === 'error') {
      setStatus('idle')
    }
  }, [setError, status, setStatus])

  // Update stats
  const updateStats = useCallback(
    (newStats: PipelineStats) => {
      setStats(newStats)
    },
    [setStats],
  )

  const { exportPreviewImage } = useHqPreviewExportAction({
    sessionRef,
    decodedImageRef,
    pipelineRef,
    isMountedRef,
    exportGraphVersionRef,
    exportAbortControllerRef,
    previewCopyCanvasRef,
    previewSuspended,
    previewExportDisabledReason,
    abortExportWork,
    queueExportResultResourceDisposal,
    registerExportResultResource,
    scheduleToast,
    setProgress,
    setSession,
    setStatus,
    toast,
  })
  const {
    originalReferenceCapability,
    dualWebglAllowed,
    shouldPrepareOriginalReferenceSnapshot,
    requestOriginalReferenceFallback,
  } = useOriginalReferencePolicy({
    sessionId: session?.id ?? null,
    sessionRef,
    viewMode,
    previewSuspended,
  })
  const originalReference = useOriginalReferenceSnapshot({
    sessionId: session?.id ?? null,
    image: shouldPrepareOriginalReferenceSnapshot
      ? decodedImageRef.current
      : null,
    imageVersion: decodedImageVersion,
    displaySource,
    capability: originalReferenceCapability,
    onPendingRenderChange: setPendingOriginalReferenceSnapshotRender,
  })

  useEffect(() => {
    trackOriginalReferenceSnapshot(originalReference.snapshot)
  }, [originalReference.snapshot, trackOriginalReferenceSnapshot])

  return {
    params,
    loadedImage: {
      file: loadedImage.file,
      metadata: loadedImage.metadata,
    },
    decodedImageRef,
    decodedImageVersion,
    status,
    error,
    progress,
    lut,
    lutData: lutDataRef.current,
    lutDataRef,
    lutDataVersion,
    stats,
    hasImage,
    canExport,
    exportDisabledReason,
    canPreviewExport,
    previewExportDisabledReason,
    exportResult,
    exportShareCapability,
    exportRecovery,
    activeStyle,
    lutProfileSelection,
    activeIntensity,
    viewMode,
    compareSplit,
    previewViewport,
    currentLutName,
    sourceFileName,
    supportLevel,
    progressRecoveryHint,
    embeddedPreviewUrl,
    displaySource,
    originalReferenceSnapshot: originalReference.snapshot,
    originalReferenceFallbackReason: originalReference.fallbackReason,
    dualWebglAllowed,
    histogram,
    previewSuspended,
    loadFile,
    loadLUT,
    loadOnlineLUT,
    selectLUTProfile,
    selectIntensityLevel,
    setViewMode,
    setCompareSplit,
    setPreviewViewport,
    resetPreviewViewport,
    clearLUT,
    setParams: handleSetParams,
    setToneParams,
    resetTone,
    setColorParams,
    resetColor,
    exportImage,
    exportPreviewImage,
    recoverInterruptedExport,
    downloadExportResult,
    shareExportResult,
    copyExportResult,
    restorePreviewAfterExport,
    requestOriginalReferenceFallback,
    setOriginalPreviewPipeline,
    reset,
    dismissError,
    updateStats,
    pipelineRef,
  }
}
