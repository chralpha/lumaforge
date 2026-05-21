import type {
  LUTColorProfile,
  LUTData,
  PreviewHistogramState,
  ProcessingParams,
  RawRenderExposure,
} from '@lumaforge/luma-color-runtime'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { ProcessingStatus } from '~/atoms/raw-processor'
import {
  getProcessingParams,
  useErrorMessageValue,
  useLoadedImageValue,
  useLutValue,
  usePipelineStatsValue,
  useProcessingParamsValue,
  useProcessingStatusValue,
  useProgressValue,
  useSetErrorMessage,
  useSetLoadedImage,
  useSetLut,
  useSetPipelineStats,
  useSetProcessingParams,
  useSetProcessingStatus,
  useSetProgress,
} from '~/atoms/raw-processor'
import { yieldToPaint } from '~/lib/dom'
import {
  createCheckpointStore,
  createOpfsCheckpointBackend,
} from '~/lib/export/checkpoint-store'
import {
  emitExportDebugEvent,
  EXPORT_EXECUTION_PROFILES,
} from '~/lib/export/execution-profile'
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

import { deriveCanEdit } from '../model/derive-session'
import type {
  ExportResult,
  ExportShareCapability,
} from '../model/export-result'
import type {
  DisplaySource,
  ExportRecoveryState,
  LUTProfileSelectionState,
  StyleAsset,
} from '../model/session'
import {
  clearEmbeddedPreviewUrlFromSession,
  revokeEmbeddedPreviewObjectUrls,
} from '../services/embedded-preview-url'
import type { ExportContext } from '../services/export/orchestrate-full-res-export'
import { orchestrateFullResExport } from '../services/export/orchestrate-full-res-export'
import { deriveFullResExportReadiness } from '../services/export-readiness'
import {
  createInterruptedExportRecovery,
  validateRecoveryReselection,
} from '../services/export-recovery'
import {
  copyCanvasToClipboard,
  copyExportResultToClipboard,
  downloadExportResult as downloadStoredExportResult,
  resolveExportShareButtonCapability,
  shareExportResult as shareStoredExportResult,
} from '../services/export-result-actions'
import {
  changesRenderGraphParams,
  clearExportResultState,
  hasSameRawRenderExposure,
} from '../services/export-state'
import type { LutLoadContext } from '../services/lut/orchestrate-lut-load'
import {
  orchestrateLutLoadFromFile,
  orchestrateOnlineLutLoad,
  orchestrateProfileSelection,
} from '../services/lut/orchestrate-lut-load'
import {
  computeClearLUT,
  computeCompareSplitChange,
  computeIntensityChange,
  computeToneParams,
  computeViewModeChange,
  computeViewportChange,
} from '../services/params/orchestrate-params-update'
import type { PreviewViewport } from '../services/preview-viewport'
import {
  DEFAULT_PREVIEW_VIEWPORT,
  normalizePreviewViewport,
} from '../services/preview-viewport'
import type { RawLoadContext } from '../services/raw/orchestrate-raw-load'
import { orchestrateRawLoad } from '../services/raw/orchestrate-raw-load'
import {
  buildLUTProfileSelectionState,
  toCustomStyle,
} from '../services/style-system'
import { getProgressRecoveryHint } from '../services/workflow-status'
import { useImageSession } from './useImageSession'
import { usePreviewHistogram } from './usePreviewHistogram'

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
  exportResult: ExportResult | null
  exportShareCapability: ExportShareCapability
  exportRecovery: ExportRecoveryState
  activeStyle: StyleAsset | null
  lutProfileSelection: LUTProfileSelectionState | null
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
  exportImage: (options: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
    previousInterrupted?: boolean
    recoveredExportId?: string
  }) => Promise<void>
  recoverInterruptedExport: (file: File) => Promise<void>
  downloadExportResult: () => Promise<void>
  shareExportResult: () => Promise<void>
  copyExportResult: () => Promise<void>
  reset: () => void
  dismissError: () => void
  updateStats: (stats: PipelineStats) => void

  // Pipeline ref for export
  pipelineRef: React.RefObject<RawProcessingPipeline | null>
}

type PendingRecoveryRetry = {
  sourceExportId: string
  sessionId: string
  fileName: string
  size: number
  lastModified: number
}

export function useRawProcessor(): UseRawProcessorReturn {
  const params = useProcessingParamsValue()
  const setParams = useSetProcessingParams()
  const loadedImage = useLoadedImageValue()
  const setLoadedImage = useSetLoadedImage()
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
  const previewPipelineResourceIdRef = useRef(0)
  const decodedPreviewResourceIdRef = useRef(0)
  const exportResultResourceIdRef = useRef(0)
  const decodedPreviewResourceRef = useRef<TrackedLargeResource | null>(null)
  const previewCopyCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const sessionRef = useRef(session)
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
  const rawRenderExposureRef = useRef<RawRenderExposure | null>(null)
  const [decodedImageVersion, setDecodedImageVersion] = useState(0)
  const lutDataRef = useRef<LUTData | null>(null)
  const [lutDataVersion, setLutDataVersion] = useState(0)
  const discoveredRecoveryRef = useRef<ExportRecoveryState>({ status: 'none' })
  const [discoveredRecovery, setDiscoveredRecovery] =
    useState<ExportRecoveryState>({ status: 'none' })
  const [pendingRecoveryRetry, setPendingRecoveryRetry] =
    useState<PendingRecoveryRetry | null>(null)
  if (!resourceRegistryRef.current) {
    resourceRegistryRef.current = createResourceRegistry()
  }
  const setDiscoveredRecoveryState = useCallback(
    (next: ExportRecoveryState) => {
      discoveredRecoveryRef.current = next
      setDiscoveredRecovery(next)
    },
    [],
  )
  const hasImage = session ? deriveCanEdit(session) : false
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
  const detachedStyle =
    !session && lut
      ? {
          ...toCustomStyle(lut),
          currentIntensityLevel: 'standard' as const,
        }
      : null
  const activeStyle = session?.activeStyle || detachedStyle
  const lutProfileSelection =
    session?.lutProfileSelection ||
    (lut ? buildLUTProfileSelectionState(lut) : null)
  const activeIntensity = activeStyle?.currentIntensityLevel || 'standard'
  const viewMode = params.viewMode
  const compareSplit = params.compareSplit
  const previewViewport = session
    ? normalizePreviewViewport({
        zoom: session.viewState.zoom,
        panX: session.viewState.panX,
        panY: session.viewState.panY,
        fitMode: session.viewState.fitMode,
      })
    : DEFAULT_PREVIEW_VIEWPORT
  const currentLutName =
    activeStyle?.kind === 'custom' ? activeStyle.name : null
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
  const histogram = usePreviewHistogram({
    imageRef: decodedImageRef,
    imageVersion: decodedImageVersion,
    imageIdentity: session?.id ?? pendingLoadSessionIdRef.current ?? undefined,
    params,
    lutDataRef,
    lutDataVersion,
    displaySource,
  })
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

  const clearSessionEmbeddedPreviewUrl = useCallback(
    (sessionId?: string) => {
      setSession((prev) => {
        if (!prev || (sessionId && prev.id !== sessionId)) {
          return prev
        }

        if (!prev.previewBundle.embeddedPreview.objectUrl) {
          return prev
        }

        return clearEmbeddedPreviewUrlFromSession(prev)
      })
    },
    [setSession],
  )

  const revokeCurrentEmbeddedPreviewUrl = useCallback(() => {
    const sessionId = sessionRef.current?.id
    const urls = new Set(
      [
        embeddedPreviewUrlRef.current,
        sessionRef.current?.previewBundle.embeddedPreview.objectUrl,
      ].filter((url): url is string => Boolean(url)),
    )

    revokeEmbeddedPreviewObjectUrls(urls)

    embeddedPreviewUrlRef.current = null
    clearSessionEmbeddedPreviewUrl(sessionId)
  }, [clearSessionEmbeddedPreviewUrl])

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

  const registerCurrentPreviewPipelineForEvacuation = useCallback(() => {
    const pipeline = pipelineRef.current
    const registry = resourceRegistryRef.current
    if (!pipeline || !registry || typeof pipeline.dispose !== 'function') {
      return
    }

    const id = `webgl-pipeline-${++previewPipelineResourceIdRef.current}`
    registry.register({
      id,
      owner: 'webgl',
      kind: 'webgl-pipeline',
      dispose: () => {
        if (pipelineRef.current === pipeline) {
          pipelineRef.current = null
        }
        return pipeline.dispose({ releaseContext: true })
      },
    })
  }, [])

  const registerDecodedPreviewForEvacuation = useCallback(
    (decoded: DecodedImage | null) => {
      const previousResource = decodedPreviewResourceRef.current
      decodedPreviewResourceRef.current = null
      if (previousResource) {
        void previousResource.dispose().catch((error) => {
          console.warn('Failed to clean up decoded preview resource:', error)
        })
      }

      const registry = resourceRegistryRef.current
      if (!decoded || !registry) return

      let tracked: TrackedLargeResource | null = null
      tracked = registry.register({
        id: `decoded-preview-${++decodedPreviewResourceIdRef.current}`,
        owner: 'preview',
        kind: 'array-buffer',
        estimatedBytes: decoded.data.byteLength,
        dispose: () => {
          if (decodedPreviewResourceRef.current === tracked) {
            decodedPreviewResourceRef.current = null
          }
          if (decodedImageRef.current === decoded) {
            decodedImageRef.current = null
            setDecodedImageVersion((version) => version + 1)
          }
        },
      })
      decodedPreviewResourceRef.current = tracked
    },
    [],
  )

  const registerExportResultResource = useCallback((result: ExportResult) => {
    const registry = resourceRegistryRef.current
    if (!registry) return

    registry.register({
      id: `export-result-${++exportResultResourceIdRef.current}`,
      owner: 'export-result',
      kind: 'blob',
      estimatedBytes: result.size,
      dispose: () =>
        'cleanup' in result.output ? result.output.cleanup?.() : undefined,
    })
  }, [])

  const disposeExportResultResources = useCallback(async () => {
    const registry = resourceRegistryRef.current
    if (!registry) return

    await registry.disposeOwners(['export-result'])
  }, [])

  const queueExportResultResourceDisposal = useCallback(() => {
    void disposeExportResultResources().catch((error) => {
      console.warn('Failed to clean up export result resources:', error)
    })
  }, [disposeExportResultResources])

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

  const setDecodedImageRef = useCallback(
    (nextDecoded: DecodedImage | null) => {
      const currentExposure = rawRenderExposureRef.current
      const nextExposure = nextDecoded?.renderExposure ?? null
      decodedImageRef.current = nextDecoded
      rawRenderExposureRef.current = nextExposure
      registerDecodedPreviewForEvacuation(nextDecoded)
      setDecodedImageVersion((version) => version + 1)

      if (!hasSameRawRenderExposure(currentExposure, nextExposure)) {
        invalidateExportGraph()
      }
    },
    [invalidateExportGraph, registerDecodedPreviewForEvacuation],
  )

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    let cancelled = false

    try {
      const store = createCheckpointStore(createOpfsCheckpointBackend())

      void store
        .listSafeRetryCandidates()
        .then((manifests) => {
          if (cancelled || manifests.length === 0) return

          const manifest = manifests[0]
          if (!manifest) return

          const recovery = createInterruptedExportRecovery(manifest)
          setDiscoveredRecoveryState(recovery)
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  exportState: {
                    ...prev.exportState,
                    recovery,
                  },
                }
              : prev,
          )
        })
        .catch(() => undefined)
    } catch {
      return () => {
        cancelled = true
      }
    }

    return () => {
      cancelled = true
    }
  }, [setDiscoveredRecoveryState, setSession])

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
        setLoadedImage({ file: null, decoded: null, metadata: null })
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
    setLoadedImage,
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
        setLoadedImage,
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
        getPrewarmState: () => rawRuntimeAdapter.getPrewarmState(),
        prewarm: () => rawRuntimeAdapter.prewarm(),
      },
      refs: {
        runtimeAbortControllerRef,
        runtimeSessionRef,
        disposedRuntimeSessionsRef,
        decodedImageRef,
        sessionRef,
        pipelineRef,
        resourceRegistryRef,
        embeddedPreviewUrlRef,
        isMountedRef,
        runtimeWorkSessionIdRef,
        pendingLoadSessionIdRef,
        previewPipelineResourceIdRef,
        previewCopyCanvasRef,
      },
    }),
    [
      abortExportWork,
      abortRuntimeWork,
      clearSessionEmbeddedPreviewUrl,
      disposeRuntimeSession,
      invalidateExportGraph,
      queueExportResultResourceDisposal,
      registerCurrentPreviewPipelineForEvacuation,
      replaceFile,
      revokeCurrentEmbeddedPreviewUrl,
      scheduleToast,
      setDecodedImageRef,
      setError,
      setLoadedImage,
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

  // Stable context for the LUT load orchestrator
  const lutCtx = useMemo<LutLoadContext>(
    () => ({
      atoms: {
        setLut,
        setSession,
        setParams,
        getProcessingParams,
        lut,
        activeStyle,
      },
      refs: {
        lutDataRef,
        sessionRef,
      },
      services: {
        scheduleToast,
        invalidateExportGraph,
        setLutDataRef,
      },
    }),
    [
      activeStyle,
      invalidateExportGraph,
      lut,
      scheduleToast,
      setLut,
      setLutDataRef,
      setParams,
      setSession,
    ],
  )

  // Load LUT file
  const loadLUT = useCallback(
    (file: File) => orchestrateLutLoadFromFile(file, lutCtx),
    [lutCtx],
  )

  const loadOnlineLUT = useCallback(
    (entry: OnlineLUTEntry, options?: { signal?: AbortSignal }) =>
      orchestrateOnlineLutLoad(entry, options, lutCtx),
    [lutCtx],
  )

  const selectLUTProfile = useCallback(
    (profile: LUTColorProfile | string) =>
      orchestrateProfileSelection(profile, lutCtx),
    [lutCtx],
  )

  const selectIntensityLevel = useCallback(
    (level: 'off' | 'light' | 'standard' | 'strong') => {
      const {
        params: nextParams,
        session: nextSession,
        shouldInvalidateExportGraph,
      } = computeIntensityChange(params, session, activeStyle, level)

      if (shouldInvalidateExportGraph) {
        invalidateExportGraph()
      }
      setParams(nextParams)
      setSession(nextSession)
    },
    [
      activeStyle,
      invalidateExportGraph,
      params,
      session,
      setParams,
      setSession,
    ],
  )

  const setViewMode = useCallback(
    (mode: ProcessingParams['viewMode']) => {
      setParams((prev) => ({ ...prev, viewMode: mode }))
      setSession((prev) => computeViewModeChange(prev, mode))
    },
    [setParams, setSession],
  )

  const setCompareSplit = useCallback(
    (split: number) => {
      setParams((prev) => {
        const { nextSplit } = computeCompareSplitChange(null, split)
        return { ...prev, compareSplit: nextSplit }
      })
      setSession((prev) => computeCompareSplitChange(prev, split).session)
    },
    [setParams, setSession],
  )

  const setPreviewViewport = useCallback(
    (viewport: PreviewViewport) => {
      setSession((prev) => computeViewportChange(prev, viewport))
    },
    [setSession],
  )

  const resetPreviewViewport = useCallback(() => {
    setPreviewViewport(DEFAULT_PREVIEW_VIEWPORT)
  }, [setPreviewViewport])

  // Clear LUT
  const clearLUT = useCallback(() => {
    const {
      params: nextParams,
      session: nextSession,
      shouldInvalidateExportGraph,
    } = computeClearLUT(
      params,
      session,
      activeStyle,
      Boolean(lut),
      Boolean(lutDataRef.current),
      Boolean(lutProfileSelection),
    )

    if (shouldInvalidateExportGraph) {
      invalidateExportGraph()
    }
    setLut(null)
    setLutDataRef(null)
    setSession(nextSession)
    setParams(nextParams)
    scheduleToast(() => toast.info('LUT cleared'))
  }, [
    activeStyle,
    invalidateExportGraph,
    lut,
    lutProfileSelection,
    params,
    scheduleToast,
    session,
    setLut,
    setLutDataRef,
    setParams,
    setSession,
  ])

  // Update params
  const handleSetParams = useCallback(
    (newParams: Partial<ProcessingParams>) => {
      const shouldClearExportResult = changesRenderGraphParams(
        params,
        newParams,
      )
      setParams((prev) => ({ ...prev, ...newParams }))
      if (shouldClearExportResult) {
        invalidateExportGraph()
      }
    },
    [invalidateExportGraph, params, setParams],
  )

  const setToneParams = useCallback(
    (
      toneParams: Partial<
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
    ) => {
      let shouldClearExportResult = false
      setParams((prev) => {
        const { params: nextParams, shouldClearExportResult: shouldClear } =
          computeToneParams(prev, toneParams)
        shouldClearExportResult = shouldClear
        return nextParams
      })

      if (shouldClearExportResult) {
        invalidateExportGraph()
      }
    },
    [invalidateExportGraph, setParams],
  )

  const resetTone = useCallback(() => {
    handleSetParams({
      userExposureEv: 0,
      userContrast: 0,
      userHighlights: 0,
      userShadows: 0,
      userWhites: 0,
      userBlacks: 0,
    })
  }, [handleSetParams])

  // Export image
  const exportImage = useCallback(
    async (options: {
      quality: 'standard' | 'high'
      fidelity: 'safe' | 'balanced' | 'max'
      previousInterrupted?: boolean
      recoveredExportId?: string
    }) => {
      await orchestrateFullResExport(options, exportCtx)
    },
    [exportCtx],
  )

  useEffect(() => {
    if (!pendingRecoveryRetry) return

    if (status === 'error') {
      setPendingRecoveryRetry(null)
      return
    }

    const activeSession = sessionRef.current
    const activeFile = loadedImage.file
    if (
      !activeSession ||
      activeSession.id !== pendingRecoveryRetry.sessionId ||
      !activeFile ||
      activeFile.name !== pendingRecoveryRetry.fileName ||
      activeFile.size !== pendingRecoveryRetry.size ||
      activeFile.lastModified !== pendingRecoveryRetry.lastModified
    ) {
      setPendingRecoveryRetry(null)
      return
    }

    if (!canExport || status !== 'ready') {
      return
    }

    setPendingRecoveryRetry(null)
    void exportImage({
      quality: 'high',
      fidelity: 'safe',
      previousInterrupted: true,
      recoveredExportId: pendingRecoveryRetry.sourceExportId,
    })
  }, [canExport, exportImage, loadedImage.file, pendingRecoveryRetry, status])

  const recoverInterruptedExport = useCallback(
    async (file: File) => {
      const sessionRecovery = sessionRef.current?.exportState.recovery
      const recovery =
        sessionRecovery?.status === 'source-required'
          ? sessionRecovery
          : discoveredRecoveryRef.current.status === 'source-required'
            ? discoveredRecoveryRef.current
            : null
      if (!recovery || recovery.status !== 'source-required') {
        return
      }

      const validation = await validateRecoveryReselection(
        file,
        recovery.manifest,
      )
      if (!validation.ok) {
        scheduleToast(() =>
          toast.error('RAW file does not match', {
            description: validation.reason,
          }),
        )
        return
      }

      await loadFile(file)

      const activeSession = sessionRef.current
      if (
        activeSession?.sourceFile.name !== file.name ||
        activeSession.sourceFile.sizeBytes !== file.size
      ) {
        return
      }

      setPendingRecoveryRetry({
        sourceExportId: recovery.exportId,
        sessionId: activeSession.id,
        fileName: file.name,
        size: file.size,
        lastModified: file.lastModified,
      })
    },
    [loadFile, scheduleToast],
  )

  const createMaterializationDiagnostics = useCallback(
    (action: 'download' | 'share' | 'copy') => ({
      onMaterialize(event: {
        action: 'download' | 'share' | 'copy'
        outputKind: 'blob' | 'file-backed'
        filename: string
        byteLength: number
        materializedAt: string
        cleanup: 'scheduled' | 'not-needed' | 'completed'
      }) {
        emitExportDebugEvent({
          type: 'output-materialized',
          payload: {
            ...event,
            action,
          },
        })
      },
    }),
    [],
  )

  const downloadExportResult = useCallback(async () => {
    const result = sessionRef.current?.exportState.result
    if (!result) return

    try {
      await downloadStoredExportResult(
        result,
        createMaterializationDiagnostics('download'),
      )
    } catch (err) {
      const description =
        err instanceof Error ? err.message : 'Download action failed.'
      scheduleToast(() =>
        toast.error('Download failed', {
          description,
        }),
      )
    }
  }, [createMaterializationDiagnostics, scheduleToast])

  const shareExportResult = useCallback(async () => {
    const result = sessionRef.current?.exportState.result
    if (!result) return

    try {
      await shareStoredExportResult(
        result,
        navigator,
        createMaterializationDiagnostics('share'),
      )
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }

      const description =
        err instanceof Error ? err.message : 'Share action failed.'
      scheduleToast(() =>
        toast.error('Share failed', {
          description,
        }),
      )
    }
  }, [createMaterializationDiagnostics, scheduleToast])

  const copyExportResult = useCallback(async () => {
    const result = sessionRef.current?.exportState.result
    if (!result) return

    try {
      if (result.copyCapability.mode === 'full-resolution') {
        await copyExportResultToClipboard(
          result,
          globalThis,
          createMaterializationDiagnostics('copy'),
        )
        scheduleToast(() => toast.success('Full-resolution image copied'))
        return
      }

      if (result.copyCapability.mode === 'preview-size') {
        const previewCopyCanvas = previewCopyCanvasRef.current
        if (previewCopyCanvas) {
          await copyCanvasToClipboard(previewCopyCanvas)
          scheduleToast(() => toast.success('Preview-size image copied'))
          return
        }

        const pipeline = pipelineRef.current
        const previewSize = stats?.previewSize
        if (!pipeline || !previewSize) {
          throw new Error('Preview image is not ready to copy.')
        }

        const canvas = await pipeline.renderToHiddenCanvas({
          width: previewSize.width,
          height: previewSize.height,
        })
        await copyCanvasToClipboard(canvas)
        scheduleToast(() => toast.success('Preview-size image copied'))
        return
      }

      throw new Error(result.copyCapability.reason)
    } catch (err) {
      const description =
        err instanceof Error ? err.message : 'Copy action failed.'
      scheduleToast(() =>
        toast.error('Copy failed', {
          description,
        }),
      )
    }
  }, [createMaterializationDiagnostics, scheduleToast, stats?.previewSize])

  // Reset state
  const reset = useCallback(() => {
    runtimeWorkSessionIdRef.current = null
    pendingLoadSessionIdRef.current = null
    setPendingRecoveryRetry(null)
    abortExportWork()
    abortRuntimeWork()
    queueExportResultResourceDisposal()
    revokeCurrentEmbeddedPreviewUrl()
    previewCopyCanvasRef.current = null
    setDecodedImageRef(null)
    setLoadedImage({ file: null, decoded: null, metadata: null })
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
    setLoadedImage,
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
  const activeExportProfileName =
    exportState?.status === 'exporting' ||
    (exportState?.status === 'ready' && exportState.result)
      ? exportState.activePlan?.profileName
      : undefined
  const exportProfileSuspendsPreview = Boolean(
    activeExportProfileName &&
    EXPORT_EXECUTION_PROFILES[activeExportProfileName]
      .releasePreviewPipelineBeforeExport,
  )
  const previewEvacuatedForReadyExport =
    exportState?.status === 'ready' &&
    Boolean(exportState.result) &&
    !decodedImageRef.current &&
    !embeddedPreviewUrl
  const previewSuspended =
    exportProfileSuspendsPreview &&
    (status === 'exporting' || previewEvacuatedForReadyExport)

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
    exportImage,
    recoverInterruptedExport,
    downloadExportResult,
    shareExportResult,
    copyExportResult,
    reset,
    dismissError,
    updateStats,
    pipelineRef,
  }
}
