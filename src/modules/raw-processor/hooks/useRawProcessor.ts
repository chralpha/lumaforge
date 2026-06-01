import type {
  LUTColorProfile,
  LUTData,
  PreviewHistogramState,
  ProcessingParams,
  RawRenderExposure,
} from '@lumaforge/luma-color-runtime'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type { ExportCheckpointManifest } from '~/lib/export/checkpoint-store'
import type {
  ResourceRegistry,
  TrackedLargeResource,
} from '~/lib/export/resource-registry'
import { createResourceRegistry } from '~/lib/export/resource-registry'
import type { PipelineStats, RawProcessingPipeline } from '~/lib/gl/pipeline'
import type { ParsedLUT } from '~/lib/lut/cube-parser'
import { toLUTData } from '~/lib/lut/cube-parser'
import type { OnlineLUTEntry } from '~/lib/profiles/catalog'
import type { DecodedImage, ImageMetadata } from '~/lib/raw/decoder'
import type { RawRuntimeSession } from '~/lib/raw/runtime-adapter'
import { rawRuntimeAdapter } from '~/lib/raw/runtime-adapter'
import {
  classifyUserAgent,
  getCapabilityVectorSnapshot,
} from '~/lib/runtime/capability-vector'

import { deriveCanEdit } from '../model/derive-session'
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
import { supportsLayeredCompareCss } from '../services/compare/compare-render-mode'
import type { OriginalReferenceSnapshot } from '../services/compare/original-reference-snapshot'
import { releaseOriginalReferenceSnapshot } from '../services/compare/original-reference-snapshot'
import { deriveFullResExportReadiness } from '../services/export/export-readiness'
import { resolveExportShareButtonCapability } from '../services/export/export-result-actions'
import { clearExportResultState } from '../services/export/export-state'
import type { ExportContext } from '../services/export/orchestrate-full-res-export'
import { orchestrateFullResExport } from '../services/export/orchestrate-full-res-export'
import type { RawLoadContext } from '../services/ingest/orchestrate-raw-load'
import { orchestrateRawLoad } from '../services/ingest/orchestrate-raw-load'
import { getProgressRecoveryHint } from '../services/ingest/workflow-status'
import type { PreviewViewport } from '../services/preview/preview-viewport'
import { useRawCompareStage } from './stages/compare/useRawCompareStage'
import type { PendingRecoveryRetry } from './stages/export/useExportRecoveryAction'
import { useExportRecoveryAction } from './stages/export/useExportRecoveryAction'
import { useExportRecoveryDiscovery } from './stages/export/useExportRecoveryDiscovery'
import { useExportResourceManagement } from './stages/export/useExportResourceManagement'
import { useExportResultActions } from './stages/export/useExportResultActions'
import { useHqPreviewExportAction } from './stages/export/useHqPreviewExportAction'
import { useRawLookStage } from './stages/look/useRawLookStage'
import { useDecodedPreviewResource } from './stages/preview/useDecodedPreviewResource'
import { useEmbeddedPreviewUrlLifecycle } from './stages/preview/useEmbeddedPreviewUrlLifecycle'
import type { PreviewPipelineEvacuationHandle } from './stages/preview/usePreviewPipelineEvacuation'
import { usePreviewPipelineEvacuation } from './stages/preview/usePreviewPipelineEvacuation'
import { useImageSession } from './useImageSession'
import type {
  OriginalReferenceSnapshotCapability,
  PendingOriginalReferenceSnapshotRender,
} from './useOriginalReferenceSnapshot'
import { useOriginalReferenceSnapshot } from './useOriginalReferenceSnapshot'
import { usePreviewHistogram } from './usePreviewHistogram'

function enqueuePostCommitTask(task: () => void) {
  setTimeout(task, 0)
}

function getOriginalReferenceSnapshotCapability(): OriginalReferenceSnapshotCapability {
  const capability = getCapabilityVectorSnapshot()
  if (capability) {
    return {
      webKitClass: capability.webKitClass,
      pthread: capability.pthread,
    }
  }

  const nav = globalThis.navigator
  const touch =
    typeof nav?.maxTouchPoints === 'number' ? nav.maxTouchPoints > 0 : false

  return {
    webKitClass: classifyUserAgent(nav?.userAgent ?? '', touch),
    pthread:
      Boolean(globalThis.crossOriginIsolated) &&
      typeof SharedArrayBuffer !== 'undefined',
  }
}

function allowDualWebglCompare(
  capability: OriginalReferenceSnapshotCapability,
) {
  return capability.webKitClass === 'chromium' && capability.pthread
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
  exportImage: (options: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
    previousInterrupted?: boolean
    recoveredExportId?: string
    recoveredManifest?: ExportCheckpointManifest
  }) => Promise<void>
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

  const pipelineRef = useRef<RawProcessingPipeline | null>(null)
  const resourceRegistryRef = useRef<ResourceRegistry | null>(null)
  const originalReferenceSnapshotResourceIdRef = useRef(0)
  const originalReferenceSnapshotPendingResourceIdRef = useRef(0)
  const originalReferenceSnapshotResourceRef =
    useRef<TrackedLargeResource | null>(null)
  const originalReferenceSnapshotResourceKeyRef = useRef<string | null>(null)
  const originalReferenceSnapshotPendingResourceRef =
    useRef<TrackedLargeResource | null>(null)
  const originalReferenceSnapshotPendingResourceKeyRef = useRef<string | null>(
    null,
  )
  const previewCopyCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const sessionRef = useRef(session)
  const compareStage = useRawCompareStage({
    baseParams,
    session,
    sessionRef,
    setParams,
    setSession,
  })
  const embeddedPreviewUrlRef = useRef<string | null>(null)
  const isMountedRef = useRef(false)
  const runtimeWorkSessionIdRef = useRef<string | null>(null)
  const pendingLoadSessionIdRef = useRef<string | null>(null)
  const runtimeSessionRef = useRef<RawRuntimeSession | null>(null)
  const runtimeAbortControllerRef = useRef<AbortController | null>(null)
  const exportAbortControllerRef = useRef<AbortController | null>(null)
  const exportGraphVersionRef = useRef(0)
  const disposedRuntimeSessionsRef = useRef<WeakSet<RawRuntimeSession>>(
    new WeakSet(),
  )
  const decodedImageRef = useRef<DecodedImage | null>(null)
  const paramsRef = useRef(compareStage.params)
  const originalPreviewPipelineRef =
    useRef<PreviewPipelineEvacuationHandle | null>(null)
  const rawRenderExposureRef = useRef<RawRenderExposure | null>(null)
  const [decodedImageVersion, setDecodedImageVersion] = useState(0)
  const lutDataRef = useRef<LUTData | null>(null)
  const [lutDataVersion, setLutDataVersion] = useState(0)
  const discoveredRecoveryRef = useRef<ExportRecoveryState>({ status: 'none' })
  const [discoveredRecovery, setDiscoveredRecovery] =
    useState<ExportRecoveryState>({ status: 'none' })
  const [pendingRecoveryRetry, setPendingRecoveryRetry] =
    useState<PendingRecoveryRetry | null>(null)
  const [
    originalReferenceFallbackRequestSessionId,
    setOriginalReferenceFallbackRequestSessionId,
  ] = useState<string | null>(null)
  if (!resourceRegistryRef.current) {
    resourceRegistryRef.current = createResourceRegistry()
  }
  const getCurrentProcessingParams = useCallback(() => paramsRef.current, [])
  const scheduleToast = useCallback((notify: () => void) => {
    // Sonner uses flushSync internally; move RAW-workspace toasts out of the
    // current commit so dev-only tooling does not crash on the same render pass.
    enqueuePostCommitTask(() => {
      if (!isMountedRef.current) {
        return
      }

      notify()
    })
  }, [])
  const setLutDataRef = useCallback((nextLutData: LUTData | null) => {
    lutDataRef.current = nextLutData
    setLutDataVersion((version) => version + 1)
  }, [])
  sessionRef.current = session
  const setDiscoveredRecoveryState = useCallback(
    (next: ExportRecoveryState) => {
      discoveredRecoveryRef.current = next
      setDiscoveredRecovery(next)
    },
    [],
  )
  const hasImage = session ? deriveCanEdit(session) : false
  const loadedImage = useMemo(
    () => ({
      file: session?.sourceFile.file ?? null,
      metadata: session?.sourceFile.metadata ?? null,
    }),
    [session?.sourceFile.file, session?.sourceFile.metadata],
  )
  const rawRenderExposure =
    decodedImageRef.current?.renderExposure ?? rawRenderExposureRef.current
  const exportReadiness = deriveFullResExportReadiness({
    sourceFile: loadedImage.file,
    session,
    rawRenderExposure,
  })
  const canExport = exportReadiness.canExport
  const exportDisabledReason = !canExport
    ? exportReadiness.disabledReason
    : undefined
  const {
    viewMode,
    compareSplit,
    previewViewport,
    setViewMode,
    setCompareSplit,
    setPreviewViewport,
    resetPreviewViewport,
  } = compareStage
  const sourceFileName =
    session?.sourceFile.name || loadedImage.file?.name || 'RAW photo'
  const supportLevel =
    session?.sourceFile.supportLevel === 'official'
      ? 'official'
      : 'experimental'
  const progressRecoveryHint = getProgressRecoveryHint(status)
  const embeddedPreviewUrl =
    session?.previewBundle.embeddedPreview.objectUrl || null
  const displaySource = session?.previewBundle.displaySource || 'none'

  const { clearSessionEmbeddedPreviewUrl, revokeCurrentEmbeddedPreviewUrl } =
    useEmbeddedPreviewUrlLifecycle({
      embeddedPreviewUrlRef,
      sessionRef,
      setSession,
    })

  const requestOriginalReferenceFallback = useCallback(() => {
    setOriginalReferenceFallbackRequestSessionId(sessionRef.current?.id ?? null)
  }, [])

  const setOriginalPreviewPipeline = useCallback(
    (pipeline: PreviewPipelineEvacuationHandle | null) => {
      originalPreviewPipelineRef.current = pipeline
    },
    [],
  )

  const setPendingOriginalReferenceSnapshotRender = useCallback(
    (
      pending: PendingOriginalReferenceSnapshotRender | null,
      clearKey?: string,
    ) => {
      const previous = originalReferenceSnapshotPendingResourceRef.current
      const previousKey = originalReferenceSnapshotPendingResourceKeyRef.current

      const disposePrevious = (resource: TrackedLargeResource) => {
        originalReferenceSnapshotPendingResourceRef.current = null
        originalReferenceSnapshotPendingResourceKeyRef.current = null
        void resource.dispose().catch((error) => {
          console.warn(
            'Failed to clean up pending original reference snapshot:',
            error,
          )
        })
      }

      if (!pending) {
        if (!previous) {
          return
        }
        if (clearKey && previousKey !== clearKey) {
          return
        }
        disposePrevious(previous)
        return
      }

      if (previous && previousKey === pending.key) {
        return
      }

      if (previous) {
        disposePrevious(previous)
      }

      const registry = resourceRegistryRef.current
      if (!registry) {
        return
      }

      let tracked: TrackedLargeResource | null = null
      tracked = registry.register({
        id: `original-reference-snapshot-render-${++originalReferenceSnapshotPendingResourceIdRef.current}`,
        owner: 'preview',
        kind: 'webgl-pipeline',
        dispose: () => {
          if (originalReferenceSnapshotPendingResourceRef.current === tracked) {
            originalReferenceSnapshotPendingResourceRef.current = null
            originalReferenceSnapshotPendingResourceKeyRef.current = null
          }
          return pending.dispose()
        },
      })
      originalReferenceSnapshotPendingResourceRef.current = tracked
      originalReferenceSnapshotPendingResourceKeyRef.current = pending.key
    },
    [],
  )

  const disposeRuntimeSession = useCallback(
    (runtimeSession = runtimeSessionRef.current) => {
      if (
        !runtimeSession ||
        disposedRuntimeSessionsRef.current.has(runtimeSession)
      ) {
        return
      }

      disposedRuntimeSessionsRef.current.add(runtimeSession)
      runtimeSession.dispose()
      if (runtimeSessionRef.current === runtimeSession) {
        runtimeSessionRef.current = null
      }
    },
    [],
  )

  const abortRuntimeWork = useCallback(() => {
    runtimeWorkSessionIdRef.current = null
    const controller = runtimeAbortControllerRef.current
    if (controller && !controller.signal.aborted) {
      controller.abort()
    }
    runtimeAbortControllerRef.current = null
    disposeRuntimeSession()
  }, [disposeRuntimeSession])

  const abortExportWork = useCallback(() => {
    const controller = exportAbortControllerRef.current
    if (controller && !controller.signal.aborted) {
      controller.abort()
    }
    exportAbortControllerRef.current = null
  }, [])

  const { registerCurrentPreviewPipelineForEvacuation } =
    usePreviewPipelineEvacuation({
      resourceRegistryRef,
      pipelineRef,
      originalPreviewPipelineRef,
    })

  const { registerExportResultResource, queueExportResultResourceDisposal } =
    useExportResourceManagement({ resourceRegistryRef })

  const invalidateExportGraph = useCallback(() => {
    exportGraphVersionRef.current += 1
    previewCopyCanvasRef.current = null
    const hasActiveExport =
      Boolean(
        exportAbortControllerRef.current &&
        !exportAbortControllerRef.current.signal.aborted,
      ) || sessionRef.current?.exportState.status === 'exporting'

    abortExportWork()
    queueExportResultResourceDisposal()
    setSession(clearExportResultState)

    if (hasActiveExport) {
      setStatus('ready')
      setProgress(0)
    }
  }, [
    abortExportWork,
    queueExportResultResourceDisposal,
    setProgress,
    setSession,
    setStatus,
  ])

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

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      const pendingLoadSessionId = pendingLoadSessionIdRef.current
      isMountedRef.current = false
      runtimeWorkSessionIdRef.current = null
      pendingLoadSessionIdRef.current = null
      abortExportWork()
      abortRuntimeWork()
      queueExportResultResourceDisposal()
      revokeCurrentEmbeddedPreviewUrl()
      previewCopyCanvasRef.current = null
      if (pendingLoadSessionId) {
        decodedImageRef.current = null
        setStatus('idle')
        setError(null)
        setProgress(0)
        setStats(null)
        setSession((prev) => (prev?.id === pendingLoadSessionId ? null : prev))
      }
      sessionRef.current = null
    }
  }, [
    abortExportWork,
    abortRuntimeWork,
    queueExportResultResourceDisposal,
    revokeCurrentEmbeddedPreviewUrl,
    setError,
    setProgress,
    setSession,
    setStats,
    setStatus,
  ])

  // Convert LUT to pipeline format when it changes
  useEffect(() => {
    if (lut) {
      setLutDataRef(toLUTData(lut))
    } else {
      setLutDataRef(null)
    }
  }, [lut, setLutDataRef])

  // Stable context for the RAW load orchestrator
  const rawLoadCtx = useMemo<RawLoadContext>(
    () => ({
      atoms: {
        setStatus,
        setError,
        setProgress,
        getProcessingParams: getCurrentProcessingParams,
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
        getPrewarmState: () => rawRuntimeAdapter.getPrewarmState(),
        prewarm: () => rawRuntimeAdapter.prewarm(),
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
      disposeRuntimeSession,
      getCurrentProcessingParams,
      invalidateExportGraph,
      queueExportResultResourceDisposal,
      registerCurrentPreviewPipelineForEvacuation,
      replaceFile,
      revokeCurrentEmbeddedPreviewUrl,
      scheduleToast,
      setDecodedImageRef,
      setError,
      setParams,
      setProgress,
      setSession,
      setStats,
      setStatus,
    ],
  )

  // Load RAW file
  const loadFile = useCallback(
    (file: File) =>
      orchestrateRawLoad(file, params, lut, activeStyle, rawLoadCtx),
    [params, lut, activeStyle, rawLoadCtx],
  )

  const restorePreviewAfterExport = useCallback(async () => {
    const activeSession = sessionRef.current
    const file = loadedImage.file

    if (!activeSession || !file) {
      return
    }

    abortRuntimeWork()
    const restoreAbortController = new AbortController()
    runtimeAbortControllerRef.current = restoreAbortController
    runtimeWorkSessionIdRef.current = activeSession.id
    setStatus('decoding')
    setProgress(0)
    setError(null)

    let runtimeSession: RawRuntimeSession | null = null
    const matchesActiveSession = () =>
      isMountedRef.current &&
      !restoreAbortController.signal.aborted &&
      sessionRef.current?.id === activeSession.id &&
      runtimeWorkSessionIdRef.current === activeSession.id
    const mapPhaseToStatus = (
      phase: 'loading' | 'decoding' | 'processing' | 'complete',
    ): ProcessingStatus => {
      if (phase === 'loading') return 'loading'
      if (phase === 'decoding') return 'decoding'
      if (phase === 'processing') return 'processing'
      return 'ready'
    }

    try {
      runtimeSession = await rawRuntimeAdapter.openSession(
        file,
        restoreAbortController.signal,
      )
      if (!matchesActiveSession()) {
        return
      }

      runtimeSessionRef.current = runtimeSession
      const decoded = await runtimeSession.decodeQuickRaw(
        ({ phase, progress }) => {
          if (!matchesActiveSession()) return
          setStatus(mapPhaseToStatus(phase))
          setProgress(progress)
        },
        restoreAbortController.signal,
      )

      if (!matchesActiveSession()) {
        return
      }

      setDecodedImageRef(decoded, { preserveExportResult: true })
      setSession((prev) =>
        prev && prev.id === activeSession.id
          ? {
              ...prev,
              previewBundle: {
                ...prev.previewBundle,
                quickDecodePreview: {
                  status: 'ready',
                  width: decoded.width,
                  height: decoded.height,
                  timings: decoded.timings,
                },
                displaySource: 'quick',
              },
              renderState: {
                ...prev.renderState,
                status: 'ready',
                lastRenderSource: 'quick',
              },
              sourceFile: {
                ...prev.sourceFile,
                metadata: decoded.metadata,
              },
            }
          : prev,
      )
      setStatus('ready')
      setProgress(100)
    } catch (err) {
      if (!matchesActiveSession()) {
        return
      }

      const description =
        err instanceof Error ? err.message : 'Preview restore failed.'
      setStatus('ready')
      setProgress(0)
      scheduleToast(() =>
        toast.error('Preview restore failed', {
          description,
        }),
      )
    } finally {
      if (runtimeAbortControllerRef.current === restoreAbortController) {
        runtimeAbortControllerRef.current = null
      }
      if (runtimeWorkSessionIdRef.current === activeSession.id) {
        runtimeWorkSessionIdRef.current = null
      }
      if (runtimeSession) {
        disposeRuntimeSession(runtimeSession)
      }
    }
  }, [
    abortRuntimeWork,
    disposeRuntimeSession,
    loadedImage.file,
    scheduleToast,
    setDecodedImageRef,
    setError,
    setProgress,
    setSession,
    setStatus,
  ])

  // Stable context for the full-res export orchestrator
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
        terminateRawDecodeBridge: rawRuntimeAdapter.terminateDecodeBridge,
        registerCurrentPreviewPipelineForEvacuation,
        registerExportResultResource,
        revokeCurrentEmbeddedPreviewUrl,
      },
    }),
    [
      loadedImage,
      params,
      session,
      stats,
      lutDataRef,
      setStatus,
      setError,
      setProgress,
      setSession,
      setDiscoveredRecoveryState,
      scheduleToast,
      abortExportWork,
      abortRuntimeWork,
      registerCurrentPreviewPipelineForEvacuation,
      registerExportResultResource,
      revokeCurrentEmbeddedPreviewUrl,
    ],
  )

  // Export image
  const exportImage = useCallback(
    async (options: {
      quality: 'standard' | 'high'
      fidelity: 'safe' | 'balanced' | 'max'
      previousInterrupted?: boolean
      recoveredExportId?: string
      recoveredManifest?: ExportCheckpointManifest
    }) => {
      await orchestrateFullResExport(options, exportCtx)
    },
    [exportCtx],
  )

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

  // Reset state
  const reset = useCallback(() => {
    runtimeWorkSessionIdRef.current = null
    pendingLoadSessionIdRef.current = null
    setPendingRecoveryRetry(null)
    abortExportWork()
    abortRuntimeWork()
    queueExportResultResourceDisposal('reset-session')
    revokeCurrentEmbeddedPreviewUrl()
    previewCopyCanvasRef.current = null
    setDecodedImageRef(null)
    setStatus('idle')
    setError(null)
    setProgress(0)
    setStats(null)
    resetSession()
    sessionRef.current = null
  }, [
    abortExportWork,
    abortRuntimeWork,
    queueExportResultResourceDisposal,
    resetSession,
    revokeCurrentEmbeddedPreviewUrl,
    setDecodedImageRef,
    setError,
    setProgress,
    setStats,
    setStatus,
  ])

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

  const exportResult = session?.exportState.result ?? null
  const exportShareCapability = exportResult
    ? resolveExportShareButtonCapability()
    : { available: false as const, reason: 'Export a JPEG before sharing.' }
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
  const originalReferenceCapability = getOriginalReferenceSnapshotCapability()
  const dualWebglAllowed = allowDualWebglCompare(originalReferenceCapability)
  const supportsCssCompare = supportsLayeredCompareCss()
  const originalReferenceFallbackRequested =
    Boolean(session?.id) &&
    originalReferenceFallbackRequestSessionId === session?.id

  useEffect(() => {
    if (viewMode !== 'compare' || previewSuspended) {
      setOriginalReferenceFallbackRequestSessionId(null)
    }
  }, [previewSuspended, viewMode])

  const shouldPrepareOriginalReferenceSnapshot =
    viewMode === 'compare' &&
    !previewSuspended &&
    supportsCssCompare &&
    (!dualWebglAllowed || originalReferenceFallbackRequested)
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
    const snapshot = originalReference.snapshot
    const currentResource = originalReferenceSnapshotResourceRef.current
    const currentResourceKey = originalReferenceSnapshotResourceKeyRef.current

    if (currentResource && currentResourceKey !== snapshot?.key) {
      originalReferenceSnapshotResourceRef.current = null
      originalReferenceSnapshotResourceKeyRef.current = null
      void currentResource.dispose().catch((error) => {
        console.warn('Failed to clean up original reference snapshot:', error)
      })
    }

    if (!snapshot || currentResourceKey === snapshot.key) {
      return
    }

    const registry = resourceRegistryRef.current
    if (!registry) {
      return
    }

    let tracked: TrackedLargeResource | null = null
    tracked = registry.register({
      id: `original-reference-snapshot-${++originalReferenceSnapshotResourceIdRef.current}`,
      owner: 'preview',
      kind: 'object-url',
      estimatedBytes: snapshot.estimatedBytes,
      dispose: () => {
        if (originalReferenceSnapshotResourceRef.current === tracked) {
          originalReferenceSnapshotResourceRef.current = null
          originalReferenceSnapshotResourceKeyRef.current = null
        }
        releaseOriginalReferenceSnapshot(snapshot)
      },
    })
    originalReferenceSnapshotResourceRef.current = tracked
    originalReferenceSnapshotResourceKeyRef.current = snapshot.key
  }, [originalReference.snapshot])

  useEffect(() => {
    return () => {
      const pendingResource =
        originalReferenceSnapshotPendingResourceRef.current
      originalReferenceSnapshotPendingResourceRef.current = null
      originalReferenceSnapshotPendingResourceKeyRef.current = null
      void pendingResource?.dispose().catch((error) => {
        console.warn(
          'Failed to clean up pending original reference snapshot:',
          error,
        )
      })

      const resource = originalReferenceSnapshotResourceRef.current
      originalReferenceSnapshotResourceRef.current = null
      originalReferenceSnapshotResourceKeyRef.current = null
      void resource?.dispose().catch((error) => {
        console.warn('Failed to clean up original reference snapshot:', error)
      })
    }
  }, [])

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
