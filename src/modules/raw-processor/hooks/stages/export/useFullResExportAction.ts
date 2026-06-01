import { useCallback, useMemo } from 'react'

import type { ExportContext } from '../../../services/export/orchestrate-full-res-export'
import { orchestrateFullResExport } from '../../../services/export/orchestrate-full-res-export'

export type FullResExportOptions = Parameters<
  typeof orchestrateFullResExport
>[0]

export type UseFullResExportActionInput = ExportContext['atoms'] &
  ExportContext['refs'] &
  ExportContext['services'] & {
    orchestrateExport?: typeof orchestrateFullResExport
  }

export function useFullResExportAction({
  loadedImage,
  session,
  params,
  stats,
  lutDataRef,
  decodedImageRef,
  exportAbortControllerRef,
  exportGraphVersionRef,
  isMountedRef,
  sessionRef,
  pipelineRef,
  resourceRegistryRef,
  previewCopyCanvasRef,
  setStatus,
  setError,
  setProgress,
  setSession,
  setDiscoveredRecoveryState,
  scheduleToast,
  abortExportWork,
  abortRuntimeWork,
  terminateRawDecodeBridge,
  registerCurrentPreviewPipelineForEvacuation,
  registerExportResultResource,
  revokeCurrentEmbeddedPreviewUrl,
  orchestrateExport = orchestrateFullResExport,
}: UseFullResExportActionInput) {
  const exportCtx = useMemo<ExportContext>(
    () => ({
      atoms: {
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
      },
      refs: {
        exportAbortControllerRef,
        exportGraphVersionRef,
        isMountedRef,
        sessionRef,
        pipelineRef,
        resourceRegistryRef,
        previewCopyCanvasRef,
      },
      services: {
        scheduleToast,
        abortExportWork,
        abortRuntimeWork,
        terminateRawDecodeBridge,
        registerCurrentPreviewPipelineForEvacuation,
        registerExportResultResource,
        revokeCurrentEmbeddedPreviewUrl,
      },
    }),
    [
      abortExportWork,
      abortRuntimeWork,
      decodedImageRef,
      exportAbortControllerRef,
      exportGraphVersionRef,
      isMountedRef,
      loadedImage,
      lutDataRef,
      params,
      pipelineRef,
      previewCopyCanvasRef,
      registerCurrentPreviewPipelineForEvacuation,
      registerExportResultResource,
      resourceRegistryRef,
      revokeCurrentEmbeddedPreviewUrl,
      scheduleToast,
      session,
      sessionRef,
      setDiscoveredRecoveryState,
      setError,
      setProgress,
      setSession,
      setStatus,
      stats,
      terminateRawDecodeBridge,
    ],
  )

  const exportImage = useCallback(
    async (options: FullResExportOptions) => {
      await orchestrateExport(options, exportCtx)
    },
    [exportCtx, orchestrateExport],
  )

  return { exportImage }
}
