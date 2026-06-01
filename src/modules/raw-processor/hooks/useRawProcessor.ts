import { useState } from 'react'
import { toast } from 'sonner'

import { yieldToPaint } from '~/lib/dom'
import { rawRuntimeAdapter } from '~/lib/raw/runtime-adapter'

import {
  useLutValue,
  useProcessingParamsValue,
  useSetLut,
  useSetProcessingParams,
} from '../state/workflow.atoms'
import { useOriginalReferenceStage } from './stages/compare/useOriginalReferenceStage'
import { useRawCompareStage } from './stages/compare/useRawCompareStage'
import { useExportGraphInvalidation } from './stages/export/useExportGraphInvalidation'
import { useExportRecoveryDiscovery } from './stages/export/useExportRecoveryDiscovery'
import { useExportRecoveryState } from './stages/export/useExportRecoveryState'
import { useExportResourceManagement } from './stages/export/useExportResourceManagement'
import { useRawExportStage } from './stages/export/useRawExportStage'
import { useRawIngestStage } from './stages/ingest/useRawIngestStage'
import { useRawRuntimeControls } from './stages/ingest/useRawRuntimeControls'
import { useRawSourceState } from './stages/ingest/useRawSourceState'
import { useLutDataState } from './stages/look/useLutDataState'
import { useRawLookStage } from './stages/look/useRawLookStage'
import { useRawPreviewStage } from './stages/preview/useRawPreviewStage'
import { useImageSession } from './useImageSession'
import type { UseRawProcessorReturn } from './useRawProcessor.types'
import { useRawWorkflowActions } from './useRawWorkflowActions'
import { useRawWorkflowRefs } from './useRawWorkflowRefs'
import { useRawWorkflowState } from './useRawWorkflowState'

export type { UseRawProcessorReturn } from './useRawProcessor.types'

export function useRawProcessor(): UseRawProcessorReturn {
  const baseParams = useProcessingParamsValue()
  const setParams = useSetProcessingParams()
  const lut = useLutValue()
  const setLut = useSetLut()
  const {
    status,
    setStatus,
    error,
    setError,
    progress,
    setProgress,
    stats,
    setStats,
  } = useRawWorkflowState()
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
