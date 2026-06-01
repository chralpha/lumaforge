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
import type { ExportCheckpointManifest } from '~/lib/export/checkpoint-store'
import {
  createCheckpointStore,
  createOpfsCheckpointBackend,
} from '~/lib/export/checkpoint-store'
import type { ExportResourceCleanupReason } from '~/lib/export/execution-profile'
import { emitExportDebugEvent } from '~/lib/export/execution-profile'
import type {
  LargeResourceOwner,
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
import { toResourceCleanupDebugPayload } from '../services/export/export-evacuation'
import { deriveFullResExportReadiness } from '../services/export/export-readiness'
import {
  createInterruptedExportRecovery,
  validateRecoveryReselection,
} from '../services/export/export-recovery'
import {
  copyCanvasToClipboard,
  copyExportResultToClipboard,
  downloadExportResult as downloadStoredExportResult,
  resolveExportCopyCapability,
  resolveExportShareButtonCapability,
  shareExportResult as shareStoredExportResult,
} from '../services/export/export-result-actions'
import { createCompletedExportResult } from '../services/export/export-result-materialization'
import {
  changesRenderGraphParams,
  clearExportResultForActiveExport,
  clearExportResultState,
  hasSameRawRenderExposure,
} from '../services/export/export-state'
import {
  buildPreviewExportFilename,
  HQ_PREVIEW_EXPORT_QUALITY,
  resolveHqPreviewExportSize,
  runPreviewExportJob,
} from '../services/export/export-system'
import type { ExportContext } from '../services/export/orchestrate-full-res-export'
import { orchestrateFullResExport } from '../services/export/orchestrate-full-res-export'
import type { RawLoadContext } from '../services/ingest/orchestrate-raw-load'
import { orchestrateRawLoad } from '../services/ingest/orchestrate-raw-load'
import { getProgressRecoveryHint } from '../services/ingest/workflow-status'
import type { LutLoadContext } from '../services/look/orchestrate-lut-load'
import {
  orchestrateLutLoadFromFile,
  orchestrateOnlineLutLoad,
  orchestrateProfileSelection,
} from '../services/look/orchestrate-lut-load'
import {
  computeClearLUT,
  computeColorParams,
  computeCompareSplitChange,
  computeIntensityChange,
  computeToneParams,
  computeViewModeChange,
  computeViewportChange,
} from '../services/look/orchestrate-params-update'
import {
  buildLUTContractSelectionState,
  toCustomStyle,
} from '../services/look/style-system'
import {
  clearEmbeddedPreviewUrlFromSession,
  revokeEmbeddedPreviewObjectUrls,
} from '../services/preview/embedded-preview-url'
import type { PreviewViewport } from '../services/preview/preview-viewport'
import {
  DEFAULT_PREVIEW_VIEWPORT,
  normalizePreviewViewport,
} from '../services/preview/preview-viewport'
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

function resolveHqPreviewExportCopyCapability() {
  const capability = resolveExportCopyCapability()
  if (capability.mode === 'full-resolution') {
    return {
      mode: 'hq-preview' as const,
      label: 'Copy HQ preview image' as const,
    }
  }

  if (capability.mode === 'unavailable') return capability

  return {
    mode: 'unavailable' as const,
    reason: 'This browser cannot copy HQ preview JPEG files.',
  }
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

type PendingRecoveryRetry = {
  sourceExportId: string
  manifest: ExportCheckpointManifest
  sessionId: string
  fileName: string
  size: number
  lastModified: number
}

type PreviewPipelineEvacuationHandle = Pick<RawProcessingPipeline, 'dispose'>

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
  const originalReferenceSnapshotResourceIdRef = useRef(0)
  const originalReferenceSnapshotPendingResourceIdRef = useRef(0)
  const decodedPreviewResourceRef = useRef<TrackedLargeResource | null>(null)
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
  sessionRef.current = session
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
    (lut ? buildLUTContractSelectionState(lut) : null)
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

  const registerCurrentPreviewPipelineForEvacuation = useCallback(() => {
    const registry = resourceRegistryRef.current
    if (!registry) {
      return
    }

    const registerPipeline = (
      label: 'processed' | 'original',
      pipeline: PreviewPipelineEvacuationHandle | null,
      clearCurrent: () => void,
    ) => {
      if (!pipeline || typeof pipeline.dispose !== 'function') {
        return
      }

      const id = `webgl-pipeline-${++previewPipelineResourceIdRef.current}-${label}`
      registry.register({
        id,
        owner: 'webgl',
        kind: 'webgl-pipeline',
        dispose: () => {
          clearCurrent()
          return pipeline.dispose({ releaseContext: true })
        },
      })
    }

    const processedPipeline = pipelineRef.current
    registerPipeline('processed', processedPipeline, () => {
      if (pipelineRef.current === processedPipeline) {
        pipelineRef.current = null
      }
    })

    const originalPipeline = originalPreviewPipelineRef.current
    registerPipeline('original', originalPipeline, () => {
      if (originalPreviewPipelineRef.current === originalPipeline) {
        originalPreviewPipelineRef.current = null
      }
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

  const disposeExportResultResources = useCallback(
    async (reason?: ExportResourceCleanupReason) => {
      const registry = resourceRegistryRef.current
      if (!registry) return

      const disposedOwners: LargeResourceOwner[] = ['export-result']
      await registry.disposeOwners(disposedOwners)

      if (!reason) return

      emitExportDebugEvent({
        type: 'resource-cleanup',
        payload: toResourceCleanupDebugPayload({
          reason,
          disposedOwners,
          registryCheck: registry.assertZeroLive(disposedOwners),
          snapshot: registry.snapshot(),
        }),
      })
    },
    [],
  )

  const queueExportResultResourceDisposal = useCallback(
    (reason?: ExportResourceCleanupReason) => {
      void disposeExportResultResources(reason).catch((error) => {
        console.warn('Failed to clean up export result resources:', error)
      })
    },
    [disposeExportResultResources],
  )

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
    (
      nextDecoded: DecodedImage | null,
      options?: { preserveExportResult?: boolean },
    ) => {
      const currentExposure = rawRenderExposureRef.current
      const nextExposure = nextDecoded?.renderExposure ?? null
      decodedImageRef.current = nextDecoded
      rawRenderExposureRef.current = nextExposure
      registerDecodedPreviewForEvacuation(nextDecoded)
      setDecodedImageVersion((version) => version + 1)

      if (
        !options?.preserveExportResult &&
        !hasSameRawRenderExposure(currentExposure, nextExposure)
      ) {
        invalidateExportGraph()
      }
    },
    [invalidateExportGraph, registerDecodedPreviewForEvacuation],
  )

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
        setLoadedImage({ file: null, metadata: null })
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
      setLoadedImage({ file, metadata: decoded.metadata })
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
    setLoadedImage,
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

  const setColorParams = useCallback(
    (
      colorParams: Partial<
        Pick<ProcessingParams, 'userTemperature' | 'userTint'>
      >,
    ) => {
      let shouldClearExportResult = false
      setParams((prev) => {
        const { params: nextParams, shouldClearExportResult: shouldClear } =
          computeColorParams(prev, colorParams)
        shouldClearExportResult = shouldClear
        return nextParams
      })

      if (shouldClearExportResult) {
        invalidateExportGraph()
      }
    },
    [invalidateExportGraph, setParams],
  )

  const resetColor = useCallback(() => {
    handleSetParams({
      userTemperature: 0,
      userTint: 0,
    })
  }, [handleSetParams])

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
      recoveredManifest: pendingRecoveryRetry.manifest,
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
        manifest: recovery.manifest,
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

      if (result.copyCapability.mode === 'hq-preview') {
        await copyExportResultToClipboard(
          result,
          globalThis,
          createMaterializationDiagnostics('copy'),
        )
        scheduleToast(() => toast.success('HQ preview image copied'))
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
    queueExportResultResourceDisposal('reset-session')
    revokeCurrentEmbeddedPreviewUrl()
    previewCopyCanvasRef.current = null
    setDecodedImageRef(null)
    setLoadedImage({ file: null, metadata: null })
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
  const exportPreviewImage = useCallback(async () => {
    const activeSession = sessionRef.current
    const sourceFile = loadedImage.file
    const image = decodedImageRef.current
    const pipeline = pipelineRef.current

    if (
      !activeSession ||
      !sourceFile ||
      !image ||
      image.source !== 'bounded-hq' ||
      !pipeline ||
      previewSuspended
    ) {
      scheduleToast(() =>
        toast.error('HQ preview export is not ready', {
          description:
            previewExportDisabledReason ??
            'HQ preview export is available after the bounded HQ preview finishes.',
        }),
      )
      return
    }

    const exportSessionId = activeSession.id
    const exportGraphVersion = exportGraphVersionRef.current
    abortExportWork()
    const exportAbortController = new AbortController()
    exportAbortControllerRef.current = exportAbortController
    previewCopyCanvasRef.current = null
    queueExportResultResourceDisposal()
    setStatus('exporting')
    setProgress(0)
    setSession((prev) =>
      prev && prev.id === exportSessionId
        ? (() => {
            const cleared = clearExportResultForActiveExport(prev)
            return {
              ...cleared,
              exportState: {
                ...cleared.exportState,
                status: 'exporting',
              },
            }
          })()
        : prev,
    )

    const isCurrentExport = () =>
      isMountedRef.current &&
      !exportAbortController.signal.aborted &&
      exportGraphVersionRef.current === exportGraphVersion &&
      sessionRef.current?.id === exportSessionId

    try {
      const outputSize = resolveHqPreviewExportSize({
        width: image.width,
        height: image.height,
      })
      const filename = buildPreviewExportFilename(
        activeSession.sourceFile.name,
        activeSession.activeStyle?.name ?? 'neutral',
      )
      const result = await runPreviewExportJob({
        filename,
        quality: HQ_PREVIEW_EXPORT_QUALITY,
        renderToCanvas: async () => {
          if (exportAbortController.signal.aborted) {
            throw new Error('HQ_PREVIEW_EXPORT_ABORTED')
          }

          return await pipeline.renderToHiddenCanvas(outputSize)
        },
      })

      if (!isCurrentExport()) return

      const exportResult = createCompletedExportResult({
        jobResult: result,
        kind: 'hq-preview',
        metadata: loadedImage.metadata,
        width: outputSize.width,
        height: outputSize.height,
        copyCapability: resolveHqPreviewExportCopyCapability(),
      })
      registerExportResultResource(exportResult)

      setSession((prev) =>
        prev && prev.id === exportSessionId
          ? {
              ...prev,
              exportState: {
                ...prev.exportState,
                status: 'ready',
                result: exportResult,
                retryRecommended: false,
                lastSuccessfulSize: outputSize,
              },
            }
          : prev,
      )
      setProgress(100)
      setStatus('ready')
      scheduleToast(() => toast.success('HQ preview JPEG ready'))
    } catch (err) {
      if (
        exportAbortController.signal.aborted ||
        !isMountedRef.current ||
        sessionRef.current?.id !== exportSessionId
      ) {
        return
      }

      const description =
        err instanceof Error ? err.message : 'HQ preview export failed.'
      setSession((prev) =>
        prev && prev.id === exportSessionId
          ? {
              ...prev,
              exportState: {
                ...prev.exportState,
                status: 'idle',
                result: undefined,
              },
            }
          : prev,
      )
      setStatus('ready')
      setProgress(0)
      scheduleToast(() =>
        toast.error('HQ preview export failed', { description }),
      )
    } finally {
      if (exportAbortControllerRef.current === exportAbortController) {
        exportAbortControllerRef.current = null
      }
    }
  }, [
    abortExportWork,
    loadedImage.file,
    loadedImage.metadata,
    previewExportDisabledReason,
    previewSuspended,
    queueExportResultResourceDisposal,
    registerExportResultResource,
    scheduleToast,
    setProgress,
    setSession,
    setStatus,
  ])
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
