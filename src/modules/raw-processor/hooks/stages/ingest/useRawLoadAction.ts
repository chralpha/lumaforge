import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import { useCallback, useMemo } from 'react'

import type { ParsedLUT } from '~/lib/lut/cube-parser'

import type { StyleAsset } from '../../../model/session'
import type { RawLoadContext } from '../../../services/ingest/orchestrate-raw-load'
import { orchestrateRawLoad } from '../../../services/ingest/orchestrate-raw-load'

export type UseRawLoadActionInput = RawLoadContext['atoms'] &
  RawLoadContext['services'] &
  RawLoadContext['refs'] & {
    params: ProcessingParams
    lut: ParsedLUT | null
    activeStyle: StyleAsset | null
    orchestrateLoad?: typeof orchestrateRawLoad
  }

export function useRawLoadAction({
  params,
  lut,
  activeStyle,
  setStatus,
  setError,
  setProgress,
  getProcessingParams,
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
  getPrewarmState,
  prewarm,
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
  orchestrateLoad = orchestrateRawLoad,
}: UseRawLoadActionInput) {
  const rawLoadCtx = useMemo<RawLoadContext>(
    () => ({
      atoms: {
        setStatus,
        setError,
        setProgress,
        getProcessingParams,
        setParams,
        setSession,
        setDecodedImageVersion,
        setStats,
        setPendingRecoveryRetry,
      },
      services: {
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
        getPrewarmState,
        prewarm,
      },
      refs: {
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
      },
    }),
    [
      abortExportWork,
      abortRuntimeWork,
      clearSessionEmbeddedPreviewUrl,
      decodedImageRef,
      disposeRuntimeSession,
      disposedRuntimeSessionsRef,
      embeddedPreviewUrlRef,
      getPrewarmState,
      getProcessingParams,
      invalidateExportGraph,
      isMountedRef,
      pendingLoadSessionIdRef,
      prewarm,
      previewCopyCanvasRef,
      queueExportResultResourceDisposal,
      registerCurrentPreviewPipelineForEvacuation,
      replaceFile,
      revokeCurrentEmbeddedPreviewUrl,
      runtimeAbortControllerRef,
      runtimeSessionRef,
      runtimeWorkSessionIdRef,
      scheduleToast,
      sessionRef,
      setDecodedImageRef,
      setDecodedImageVersion,
      setError,
      setParams,
      setPendingRecoveryRetry,
      setProgress,
      setSession,
      setStats,
      setStatus,
      yieldToPaint,
    ],
  )

  const loadFile = useCallback(
    (file: File) => orchestrateLoad(file, params, lut, activeStyle, rawLoadCtx),
    [activeStyle, lut, orchestrateLoad, params, rawLoadCtx],
  )

  return { loadFile }
}
