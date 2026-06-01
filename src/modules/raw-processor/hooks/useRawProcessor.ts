import type {
  LUTColorProfile,
  LUTData,
  PreviewHistogramState,
  ProcessingParams,
} from '@lumaforge/luma-color-runtime'
import { useState } from 'react'
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
import { useOriginalReferenceStage } from './stages/compare/useOriginalReferenceStage'
import { useRawCompareStage } from './stages/compare/useRawCompareStage'
import { useExportGraphInvalidation } from './stages/export/useExportGraphInvalidation'
import { useExportRecoveryDiscovery } from './stages/export/useExportRecoveryDiscovery'
import { useExportRecoveryState } from './stages/export/useExportRecoveryState'
import { useExportResourceManagement } from './stages/export/useExportResourceManagement'
import type { FullResExportOptions } from './stages/export/useFullResExportAction'
import { useRawExportStage } from './stages/export/useRawExportStage'
import { useRawIngestStage } from './stages/ingest/useRawIngestStage'
import { useRawRuntimeControls } from './stages/ingest/useRawRuntimeControls'
import { useRawSourceState } from './stages/ingest/useRawSourceState'
import { useLutDataState } from './stages/look/useLutDataState'
import { useRawLookStage } from './stages/look/useRawLookStage'
import type { PreviewPipelineEvacuationHandle } from './stages/preview/usePreviewPipelineEvacuation'
import { useRawPreviewStage } from './stages/preview/useRawPreviewStage'
import { useImageSession } from './useImageSession'
import { useRawWorkflowActions } from './useRawWorkflowActions'
import { useRawWorkflowRefs } from './useRawWorkflowRefs'

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
  const {
    getCurrentProcessingParams,
    scheduleToast,
    dismissError,
    updateStats,
  } = useRawWorkflowActions({
    paramsRef,
    isMountedRef,
    status,
    setError,
    setStatus,
    setStats,
  })
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
  const { disposeRuntimeSession, abortRuntimeWork, abortExportWork } =
    useRawRuntimeControls({
      runtimeSessionRef,
      runtimeAbortControllerRef,
      runtimeWorkSessionIdRef,
      exportAbortControllerRef,
      disposedRuntimeSessionsRef,
    })

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
  const {
    histogram,
    clearSessionEmbeddedPreviewUrl,
    revokeCurrentEmbeddedPreviewUrl,
    registerCurrentPreviewPipelineForEvacuation,
    setOriginalPreviewPipeline,
    setDecodedImageRef,
    restorePreviewAfterExport,
  } = useRawPreviewStage({
    loadedFile: loadedImage.file,
    session,
    sessionRef,
    pendingLoadSessionIdRef,
    decodedImageRef,
    decodedImageVersion,
    rawRenderExposureRef,
    resourceRegistryRef,
    setDecodedImageVersion,
    invalidateExportGraph,
    embeddedPreviewUrlRef,
    setSession,
    pipelineRef,
    params,
    lutDataRef,
    lutDataVersion,
    displaySource,
    isMountedRef,
    runtimeAbortControllerRef,
    runtimeWorkSessionIdRef,
    runtimeSessionRef,
    setStatus,
    setProgress,
    setError,
    abortRuntimeWork,
    disposeRuntimeSession,
    openSession: rawRuntimeAdapter.openSession,
    scheduleToast,
    toast,
  })

  useExportRecoveryDiscovery({
    setDiscoveredRecoveryState,
    setSession,
  })

  const { loadFile, reset } = useRawIngestStage({
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
    resetSession,
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
    exportImage,
    recoverInterruptedExport,
    downloadExportResult,
    shareExportResult,
    copyExportResult,
    exportPreviewImage,
  } = useRawExportStage({
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
    discoveredRecovery,
    embeddedPreviewUrl,
    status,
    hasImage,
    displaySource,
    rawRenderExposure,
    pendingRecoveryRetry,
    setPendingRecoveryRetry,
    discoveredRecoveryRef,
    loadFile,
    queueExportResultResourceDisposal,
    toast,
  })

  const {
    originalReferenceSnapshot,
    originalReferenceFallbackReason,
    dualWebglAllowed,
    requestOriginalReferenceFallback,
  } = useOriginalReferenceStage({
    sessionId: session?.id ?? null,
    sessionRef,
    viewMode,
    previewSuspended,
    decodedImageRef,
    decodedImageVersion,
    displaySource,
    resourceRegistryRef,
  })

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
    originalReferenceSnapshot,
    originalReferenceFallbackReason,
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
