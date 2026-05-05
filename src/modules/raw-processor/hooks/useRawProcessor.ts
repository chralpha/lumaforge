import type {
  LUTColorProfile,
  LUTContractSelection,
  LUTData,
  PreviewHistogramState,
  ProcessingParams,
} from '@lumaforge/luma-color-runtime'
import {
  normalizeToneParams,
  resolveExportColorGraph,
} from '@lumaforge/luma-color-runtime'
import { useCallback, useEffect, useRef, useState } from 'react'
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
import type { ExportCheckpointManifest } from '~/lib/export/checkpoint-store'
import {
  createCheckpointStore,
  createOpfsCheckpointBackend,
} from '~/lib/export/checkpoint-store'
import {
  emitExportDebugEvent,
  EXPORT_EXECUTION_PROFILES,
} from '~/lib/export/execution-profile'
import type { FullResWorkerCheckpointConfig } from '~/lib/export/full-res-export-client'
import type { ResourceRegistry } from '~/lib/export/resource-registry'
import { createResourceRegistry } from '~/lib/export/resource-registry'
import { createSourceFingerprint } from '~/lib/export/source-fingerprint'
import type { PipelineStats, RawProcessingPipeline } from '~/lib/gl/pipeline'
import type { ParsedLUT } from '~/lib/lut/cube-parser'
import {
  isSupportedLUT,
  parseCubeLUT,
  toLUTData,
  validateLUT,
} from '~/lib/lut/cube-parser'
import {
  applyLUTContractSelection,
  toLUTContractSelection,
} from '~/lib/lut/profile-resolution'
import type { OnlineLUTEntry } from '~/lib/profiles/catalog'
import {
  createBrowserOnlineProfileCache,
  fetchCachedBytesWithLimit,
  fetchVerifiedCubeAsset,
} from '~/lib/profiles/fetch'
import type { DecodedImage, ImageMetadata } from '~/lib/raw/decoder'
import { isSupportedRaw } from '~/lib/raw/decoder'
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
import { clampCompareSplit } from '../services/compare-split'
import {
  clearEmbeddedPreviewUrlFromSession,
  createEmbeddedPreviewObjectUrl,
  revokeEmbeddedPreviewObjectUrls,
} from '../services/embedded-preview-url'
import {
  createPreExportSnapshot,
  evacuateBeforeExport,
  getPreExportEvacuationOwners,
  toResourceEvacuatedDebugPayload,
} from '../services/export-evacuation'
import { deriveFullResExportReadiness } from '../services/export-readiness'
import {
  createInterruptedExportRecovery,
  validateRecoveryReselection,
} from '../services/export-recovery'
import {
  copyCanvasToClipboard,
  copyExportResultToClipboard,
  downloadExportResult as downloadStoredExportResult,
  resolveExportCopyCapability,
  resolveExportShareCapability,
  shareExportResult as shareStoredExportResult,
} from '../services/export-result-actions'
import { createCompletedExportResult } from '../services/export-result-materialization'
import {
  buildExportFailureDescription,
  changesRenderGraphParams,
  clearExportResultForActiveExport,
  clearExportResultState,
  createSafeRetryManifest,
  hasSameRawRenderExposure,
  isCheckpointMetric,
  toFullResCapabilityState,
} from '../services/export-state'
import {
  buildExportFilename,
  recommendRetryLevel,
  runFullResolutionExportJob,
  selectCurrentExportExecutionPlan,
} from '../services/export-system'
import {
  applyActiveLookToSession,
  applyLookIntensityToSession,
  clearActiveLookFromSession,
  preserveCustomLookIntensity,
} from '../services/look-session-state'
import {
  resolveLUTContractProfile,
  resolveOnlineLUTSourceName,
} from '../services/lut-workflow'
import { runPreviewPipeline } from '../services/preview-pipeline'
import { decideBoundedHqPreview } from '../services/preview-resolution-policy'
import {
  applyBoundedHqPreviewFailure,
  applyBoundedHqPreviewSkipped,
  applyPreviewLoadStarted,
  applyPreviewReady,
  applyQuickPreviewFailure,
} from '../services/preview-session-state'
import { prepareRawLoadState } from '../services/raw-load-preparation'
import {
  buildLUTProfileSelectionState,
  mapIntensityLevel,
  toCustomStyle,
} from '../services/style-system'
import {
  applyCompareSplitToSession,
  applyViewModeToSession,
} from '../services/view-session-state'
import {
  getProgressRecoveryHint,
  getStableErrorCode,
  isAbortError,
  isRetryableFullResExportFailure,
  toUserFacingErrorCode,
} from '../services/workflow-status'
import { useImageSession } from './useImageSession'
import { usePreviewHistogram } from './usePreviewHistogram'

const MAX_ONLINE_CUBE_BYTES = 64 * 1024 * 1024
const onlineProfileCache = createBrowserOnlineProfileCache()

interface LoadLUTContentOptions {
  content: string
  sourceName: string
  trustedContract?: LUTContractSelection
}

class LUTLoadError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'LUTLoadError'
    this.code = code
  }
}

function enqueuePostCommitTask(task: () => void) {
  setTimeout(task, 0)
}

function createExportId() {
  return globalThis.crypto?.randomUUID?.() ?? `export-${Date.now()}`
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
  const exportResultResourceIdRef = useRef(0)
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
  const rawRenderExposure = decodedImageRef.current?.renderExposure ?? null
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
        return pipeline.dispose({ releaseContext: false })
      },
    })
  }, [])

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
      const currentExposure = decodedImageRef.current?.renderExposure ?? null
      const nextExposure = nextDecoded?.renderExposure ?? null
      decodedImageRef.current = nextDecoded
      setDecodedImageVersion((version) => version + 1)

      if (!hasSameRawRenderExposure(currentExposure, nextExposure)) {
        invalidateExportGraph()
      }
    },
    [invalidateExportGraph],
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

  // Load RAW file
  const loadFile = useCallback(
    async (file: File) => {
      if (!isSupportedRaw(file)) {
        setError(`Unsupported file format: ${file.name}`)
        return
      }

      let loadSessionId: string | null = null
      let runtimeSession: RawRuntimeSession | null = null
      let runtimeAbortController: AbortController | null = null
      let previewCompleted = false
      let disposeRuntimeSessionInFinally = true

      try {
        runtimeWorkSessionIdRef.current = null
        pendingLoadSessionIdRef.current = null
        setPendingRecoveryRetry(null)
        abortExportWork()
        abortRuntimeWork()
        queueExportResultResourceDisposal()
        revokeCurrentEmbeddedPreviewUrl()
        previewCopyCanvasRef.current = null
        runtimeAbortController = new AbortController()
        runtimeAbortControllerRef.current = runtimeAbortController
        const runtimeSignal = runtimeAbortController.signal
        const loadState = prepareRawLoadState({
          params: getProcessingParams(),
          lut,
          activeStyle,
        })

        const nextSession = replaceFile(file, loadState.retainedSessionState)
        loadSessionId = nextSession.id
        let quickPreview: DecodedImage | null = null
        let boundedHqPreview: DecodedImage | null = null

        sessionRef.current = nextSession
        runtimeWorkSessionIdRef.current = nextSession.id
        pendingLoadSessionIdRef.current = nextSession.id
        setDecodedImageRef(null)
        setLoadedImage({ file, decoded: null, metadata: null })
        setStatus('loading')
        setProgress(0)
        setError(null)
        setParams((prev) => ({
          ...prev,
          ...loadState.processingParamsPatch,
        }))

        setSession((prev) => {
          if (!prev || prev.id !== nextSession.id) {
            return prev
          }

          return applyPreviewLoadStarted(prev, loadState.compareSplit)
        })

        const matchesActiveSession = () =>
          isMountedRef.current &&
          runtimeWorkSessionIdRef.current === nextSession.id &&
          sessionRef.current?.id === nextSession.id

        const mapPhaseToStatus = (
          phase: 'loading' | 'decoding' | 'processing' | 'complete',
        ): ProcessingStatus => {
          if (phase === 'loading') return 'loading'
          if (phase === 'decoding') return 'decoding'
          if (phase === 'processing') return 'processing'
          return 'ready'
        }

        const updatePreviewState = (
          source: Exclude<DisplaySource, 'none'>,
          payload: {
            width: number
            height: number
            objectUrl?: string
            mimeType?: string
            timings?: Record<string, number | undefined>
          },
          decoded?: DecodedImage | null,
        ) => {
          if (!matchesActiveSession()) {
            return
          }

          setSession((prev) => {
            if (!prev || prev.id !== nextSession.id) {
              return prev
            }

            return applyPreviewReady(prev, source, payload, decoded)
          })

          if (decoded) {
            setDecodedImageRef(decoded)
            setLoadedImage({
              file,
              decoded: null,
              metadata: decoded.metadata,
            })
            setStatus('ready')
          }
        }

        runtimeSession = await rawRuntimeAdapter.openSession(
          file,
          runtimeSignal,
        )
        if (!matchesActiveSession()) {
          runtimeAbortController.abort()
          return
        }

        disposeRuntimeSession()
        const activeRuntimeSession = runtimeSession
        runtimeSessionRef.current = activeRuntimeSession
        const boundedHqDecision = decideBoundedHqPreview({
          sourceWidth: activeRuntimeSession.sourceDimensions.width ?? 0,
          sourceHeight: activeRuntimeSession.sourceDimensions.height ?? 0,
          userAgent:
            typeof navigator === 'undefined' ? '' : navigator.userAgent || '',
        })

        const probeExportCapability =
          'probeExportCapability' in activeRuntimeSession &&
          typeof activeRuntimeSession.probeExportCapability === 'function'
            ? activeRuntimeSession.probeExportCapability.bind(
                activeRuntimeSession,
              )
            : null

        let exportCapabilityPromise: Promise<void> | null = null
        const startExportCapabilityProbe = () => {
          if (exportCapabilityPromise) {
            return exportCapabilityPromise
          }

          if (!probeExportCapability) {
            setSession((prev) =>
              prev && prev.id === nextSession.id
                ? {
                    ...prev,
                    exportState: {
                      ...prev.exportState,
                      fullResCapability: {
                        status: 'unsupported',
                        reason:
                          'Full-resolution export is not available in this runtime build yet.',
                      },
                    },
                  }
                : prev,
            )
            exportCapabilityPromise = Promise.resolve()
            return exportCapabilityPromise
          }

          exportCapabilityPromise = probeExportCapability(runtimeSignal)
            .then((capability) => {
              if (!matchesActiveSession()) {
                return
              }

              setSession((prev) =>
                prev && prev.id === nextSession.id
                  ? {
                      ...prev,
                      exportState: {
                        ...prev.exportState,
                        fullResCapability: toFullResCapabilityState(capability),
                      },
                    }
                  : prev,
              )
            })
            .catch((probeError) => {
              if (!matchesActiveSession()) {
                return
              }

              const reason =
                probeError instanceof Error && probeError.message
                  ? probeError.message
                  : 'Full-resolution export support could not be verified.'

              setSession((prev) =>
                prev && prev.id === nextSession.id
                  ? {
                      ...prev,
                      exportState: {
                        ...prev.exportState,
                        fullResCapability: {
                          status: 'unsupported',
                          reason,
                        },
                      },
                    }
                  : prev,
              )
            })

          return exportCapabilityPromise
        }

        const previewResult = await runPreviewPipeline({
          runtimeSession: {
            extractEmbeddedPreview() {
              return activeRuntimeSession.extractEmbeddedPreview(runtimeSignal)
            },
            async decodeQuickRaw() {
              quickPreview = await activeRuntimeSession.decodeQuickRaw(
                ({ phase, progress }) => {
                  if (!matchesActiveSession()) {
                    return
                  }

                  setStatus(mapPhaseToStatus(phase))
                  setProgress(progress)
                },
                runtimeSignal,
              )

              return { width: quickPreview.width, height: quickPreview.height }
            },
            async decodeBoundedHqRaw(options) {
              boundedHqPreview = await activeRuntimeSession.decodeBoundedHqRaw(
                options,
                undefined,
                runtimeSignal,
              )

              return {
                width: boundedHqPreview.width,
                height: boundedHqPreview.height,
              }
            },
          },
          boundedHqDecision,
          onEvent: (event) => {
            if (!matchesActiveSession()) {
              return
            }

            switch (event.type) {
              case 'embedded-ready': {
                const objectUrl = createEmbeddedPreviewObjectUrl({
                  data: event.data,
                  mimeType: event.mimeType,
                })
                const previousUrl = embeddedPreviewUrlRef.current
                if (previousUrl && previousUrl !== objectUrl) {
                  revokeEmbeddedPreviewObjectUrls([previousUrl])
                }
                embeddedPreviewUrlRef.current = objectUrl

                updatePreviewState('embedded', {
                  width: event.width,
                  height: event.height,
                  objectUrl,
                  mimeType: event.mimeType,
                  timings: event.timings,
                })
                break
              }
              case 'quick-ready': {
                updatePreviewState('quick', event, quickPreview)
                void startExportCapabilityProbe()
                break
              }
              case 'quick-failed': {
                const errorCode = toUserFacingErrorCode(event.errorCode)

                setSession((prev) => {
                  if (!prev || prev.id !== nextSession.id) {
                    return prev
                  }

                  return applyQuickPreviewFailure(prev, errorCode)
                })
                setStatus('error')
                setProgress(100)
                setError(event.message)
                scheduleToast(() =>
                  toast.error('Preview unavailable', {
                    description:
                      'Full-resolution export needs a decoded RAW preview exposure before it can run.',
                  }),
                )
                break
              }
              case 'bounded-hq-ready': {
                updatePreviewState('bounded-hq', event, boundedHqPreview)
                if (boundedHqPreview) {
                  const description = `${boundedHqPreview.width}×${boundedHqPreview.height} • ${boundedHqPreview.metadata.make || 'Unknown'} ${boundedHqPreview.metadata.model || ''}`
                  scheduleToast(() =>
                    toast.success(`Loaded ${file.name}`, {
                      description,
                    }),
                  )
                }
                break
              }
              case 'bounded-hq-failed': {
                const errorCode = toUserFacingErrorCode(event.errorCode)

                setSession((prev) => {
                  if (!prev || prev.id !== nextSession.id) {
                    return prev
                  }

                  return applyBoundedHqPreviewFailure(prev, errorCode)
                })
                break
              }
              case 'bounded-hq-skipped': {
                setSession((prev) => {
                  if (!prev || prev.id !== nextSession.id) {
                    return prev
                  }

                  return applyBoundedHqPreviewSkipped(prev, event.reason)
                })
                break
              }
            }
          },
        })
        if (exportCapabilityPromise) {
          await exportCapabilityPromise
        }
        previewCompleted = true
        if (pendingLoadSessionIdRef.current === nextSession.id) {
          pendingLoadSessionIdRef.current = null
        }

        if (previewResult.boundedHqPromise) {
          disposeRuntimeSessionInFinally = false
          void previewResult.boundedHqPromise
            .finally(() => {
              if (
                runtimeWorkSessionIdRef.current === nextSession.id &&
                sessionRef.current?.id === nextSession.id
              ) {
                runtimeWorkSessionIdRef.current = null
              }
              if (
                runtimeAbortControllerRef.current === runtimeAbortController
              ) {
                runtimeAbortControllerRef.current = null
              }
              if (runtimeSessionRef.current === activeRuntimeSession) {
                disposeRuntimeSession(activeRuntimeSession)
              }
            })
            .catch(() => undefined)
        } else if (runtimeWorkSessionIdRef.current === nextSession.id) {
          runtimeWorkSessionIdRef.current = null
        }
      } catch (err) {
        if (
          !loadSessionId ||
          !isMountedRef.current ||
          runtimeWorkSessionIdRef.current !== loadSessionId ||
          sessionRef.current?.id !== loadSessionId
        ) {
          return
        }

        runtimeWorkSessionIdRef.current = null
        pendingLoadSessionIdRef.current = null

        const message =
          err instanceof Error ? err.message : 'Failed to load file'
        const errorCode = toUserFacingErrorCode(
          getStableErrorCode(err) ?? message,
        )
        setError(message)
        setSession((prev) =>
          prev && prev.id === loadSessionId
            ? {
                ...prev,
                renderState: {
                  ...prev.renderState,
                  status: 'failed',
                  lastErrorCode: errorCode,
                },
              }
            : prev,
        )
        setStatus('error')
        scheduleToast(() =>
          toast.error('Failed to load RAW file', { description: message }),
        )
      } finally {
        if (
          disposeRuntimeSessionInFinally &&
          runtimeAbortController &&
          runtimeAbortControllerRef.current === runtimeAbortController
        ) {
          if (!previewCompleted && !runtimeAbortController.signal.aborted) {
            runtimeAbortController.abort()
          }
          runtimeAbortControllerRef.current = null
        }
        if (disposeRuntimeSessionInFinally && runtimeSession) {
          disposeRuntimeSession(runtimeSession)
        }
      }
    },
    [
      activeStyle,
      abortExportWork,
      abortRuntimeWork,
      disposeRuntimeSession,
      lut,
      queueExportResultResourceDisposal,
      replaceFile,
      revokeCurrentEmbeddedPreviewUrl,
      scheduleToast,
      setDecodedImageRef,
      setError,
      setLoadedImage,
      setParams,
      setProgress,
      setSession,
      setStatus,
    ],
  )

  const reportLUTLoadFailure = useCallback(
    (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Failed to parse LUT'
      const stableCode = getStableErrorCode(error)
      const errorCode =
        toUserFacingErrorCode(stableCode ?? message) === 'RAW_UNKNOWN'
          ? 'LUT_PARSE_FAILED'
          : toUserFacingErrorCode(stableCode ?? message)

      setSession((prev) =>
        prev
          ? {
              ...prev,
              renderState: {
                ...prev.renderState,
                lastErrorCode: errorCode,
              },
            }
          : prev,
      )
      scheduleToast(() =>
        toast.error('Failed to load LUT', { description: message }),
      )
    },
    [scheduleToast, setSession],
  )

  const applyLoadedLUT = useCallback(
    (parsed: ParsedLUT) => {
      const style = toCustomStyle(parsed)
      invalidateExportGraph()
      setLut(parsed)
      setSession((prev) =>
        prev
          ? applyActiveLookToSession(prev, {
              style,
              lutProfileSelection: buildLUTProfileSelectionState(parsed),
              clearExportResult: true,
            })
          : prev,
      )
      setParams((prev) => ({
        ...prev,
        styleKind: 'custom',
        builtinPreset: null,
        intensity: mapIntensityLevel(style.defaultIntensityLevel),
      }))
      scheduleToast(() =>
        toast.success(`Loaded LUT: ${parsed.title}`, {
          description: `${parsed.size}³ grid`,
        }),
      )
    },
    [invalidateExportGraph, scheduleToast, setLut, setParams, setSession],
  )

  const loadLUTContent = useCallback(
    async (options: LoadLUTContentOptions) => {
      const parsed = parseCubeLUT(options.content, {
        sourceName: options.sourceName,
      })
      const contracted = options.trustedContract
        ? applyLUTContractSelection(parsed, options.trustedContract)
        : parsed
      if (!contracted) throw new Error('Unsupported LUT color contract.')

      const validation = validateLUT(contracted)
      if (!validation.valid) {
        throw new LUTLoadError(
          'LUT_INVALID',
          validation.errors[0] ?? 'Invalid LUT file.',
        )
      }

      applyLoadedLUT(contracted)
    },
    [applyLoadedLUT],
  )

  // Load LUT file
  const loadLUT = useCallback(
    async (file: File) => {
      if (!isSupportedLUT(file)) {
        setSession((prev) =>
          prev
            ? {
                ...prev,
                renderState: {
                  ...prev.renderState,
                  lastErrorCode: 'LUT_UNSUPPORTED_FORMAT',
                },
              }
            : prev,
        )
        scheduleToast(() =>
          toast.error('Unsupported LUT format', {
            description: 'Only .cube files are supported',
          }),
        )
        return
      }

      try {
        await loadLUTContent({
          content: await file.text(),
          sourceName: file.name,
        })
      } catch (err) {
        reportLUTLoadFailure(err)
      }
    },
    [loadLUTContent, reportLUTLoadFailure, scheduleToast, setSession],
  )

  const loadOnlineLUT = useCallback(
    async (entry: OnlineLUTEntry, options?: { signal?: AbortSignal }) => {
      try {
        if (options?.signal?.aborted) return

        const bytes =
          entry.sourceType === 'catalog-entry'
            ? await fetchVerifiedCubeAsset(entry.cube, {
                signal: options?.signal,
                maxBytes: MAX_ONLINE_CUBE_BYTES,
                cache: onlineProfileCache,
              })
            : await fetchCachedBytesWithLimit(entry.cube.url, {
                signal: options?.signal,
                maxBytes: MAX_ONLINE_CUBE_BYTES,
                cache: onlineProfileCache,
              })

        if (options?.signal?.aborted) return

        const content = new TextDecoder().decode(bytes)
        if (options?.signal?.aborted) return

        await loadLUTContent({
          content,
          sourceName: resolveOnlineLUTSourceName(entry),
          trustedContract:
            entry.sourceType === 'catalog-entry'
              ? entry.trustedContract
              : undefined,
        })
      } catch (err) {
        if (isAbortError(err) || options?.signal?.aborted) return

        reportLUTLoadFailure(err)
      }
    },
    [loadLUTContent, reportLUTLoadFailure],
  )

  const selectLUTProfile = useCallback(
    (profile: LUTColorProfile | string) => {
      if (!lut) {
        scheduleToast(() => toast.error('No LUT loaded'))
        return
      }

      const contractProfile = resolveLUTContractProfile(profile)
      const updatedLut = contractProfile
        ? applyLUTContractSelection(
            lut,
            toLUTContractSelection(contractProfile),
          )
        : undefined
      if (!updatedLut) {
        scheduleToast(() =>
          toast.error('Incomplete LUT contract', {
            description: typeof profile === 'string' ? profile : profile.id,
          }),
        )
        return
      }

      const style = preserveCustomLookIntensity(
        toCustomStyle(updatedLut),
        activeStyle,
      )

      setLut(updatedLut)
      invalidateExportGraph()
      setSession((prev) =>
        prev
          ? applyActiveLookToSession(prev, {
              style,
              lutProfileSelection: buildLUTProfileSelectionState(updatedLut),
              clearExportResult: true,
            })
          : prev,
      )
      setParams((prev) => ({
        ...prev,
        styleKind: 'custom',
        builtinPreset: null,
        intensity: mapIntensityLevel(style.currentIntensityLevel),
      }))
    },
    [
      activeStyle,
      invalidateExportGraph,
      lut,
      scheduleToast,
      setLut,
      setParams,
      setSession,
    ],
  )

  const selectIntensityLevel = useCallback(
    (level: 'off' | 'light' | 'standard' | 'strong') => {
      const shouldInvalidateExportGraph =
        params.intensity !== mapIntensityLevel(level) ||
        (activeStyle ? activeStyle.currentIntensityLevel !== level : false)

      if (shouldInvalidateExportGraph) {
        invalidateExportGraph()
      }
      setParams((prev) => ({ ...prev, intensity: mapIntensityLevel(level) }))
      setSession((prev) => {
        if (!prev) {
          return prev
        }

        return applyLookIntensityToSession(prev, {
          level,
          clearExportResult: shouldInvalidateExportGraph,
        })
      })
    },
    [
      activeStyle,
      invalidateExportGraph,
      params.intensity,
      setParams,
      setSession,
    ],
  )

  const setViewMode = useCallback(
    (mode: ProcessingParams['viewMode']) => {
      setParams((prev) => ({ ...prev, viewMode: mode }))
      setSession((prev) => {
        if (!prev) {
          return prev
        }

        return applyViewModeToSession(prev, mode)
      })
    },
    [setParams, setSession],
  )

  const setCompareSplit = useCallback(
    (split: number) => {
      const nextSplit = clampCompareSplit(split)
      setParams((prev) => ({ ...prev, compareSplit: nextSplit }))
      setSession((prev) => {
        if (!prev) return prev
        return applyCompareSplitToSession(prev, nextSplit)
      })
    },
    [setParams, setSession],
  )

  // Clear LUT
  const clearLUT = useCallback(() => {
    const shouldInvalidateExportGraph =
      params.styleKind !== 'none' ||
      params.builtinPreset !== null ||
      Boolean(activeStyle) ||
      Boolean(lut) ||
      Boolean(lutDataRef.current) ||
      Boolean(lutProfileSelection)

    if (shouldInvalidateExportGraph) {
      invalidateExportGraph()
    }
    setLut(null)
    setLutDataRef(null)
    setSession((prev) =>
      prev
        ? clearActiveLookFromSession(prev, {
            clearExportResult: shouldInvalidateExportGraph,
          })
        : prev,
    )
    setParams((prev) => ({
      ...prev,
      styleKind: 'none',
      builtinPreset: null,
    }))
    scheduleToast(() => toast.info('LUT cleared'))
  }, [
    activeStyle,
    invalidateExportGraph,
    lut,
    lutProfileSelection,
    params.builtinPreset,
    params.styleKind,
    scheduleToast,
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
        const normalized = normalizeToneParams({
          userExposureEv: toneParams.userExposureEv ?? prev.userExposureEv,
          userContrast: toneParams.userContrast ?? prev.userContrast,
          userHighlights: toneParams.userHighlights ?? prev.userHighlights,
          userShadows: toneParams.userShadows ?? prev.userShadows,
          userWhites: toneParams.userWhites ?? prev.userWhites,
          userBlacks: toneParams.userBlacks ?? prev.userBlacks,
        })
        shouldClearExportResult = changesRenderGraphParams(prev, normalized)
        return { ...prev, ...normalized }
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
    async ({
      quality,
      fidelity,
      previousInterrupted,
      recoveredExportId,
    }: {
      quality: 'standard' | 'high'
      fidelity: 'safe' | 'balanced' | 'max'
      previousInterrupted?: boolean
      recoveredExportId?: string
    }) => {
      const rawRenderExposure = decodedImageRef.current?.renderExposure ?? null
      const sourceFile = loadedImage.file
      const exportReadiness = deriveFullResExportReadiness({
        sourceFile,
        session,
        rawRenderExposure,
      })
      if (!exportReadiness.canExport) {
        const description = exportReadiness.disabledReason
        scheduleToast(() =>
          toast.error(
            'Full-resolution export is not ready',
            description ? { description } : undefined,
          ),
        )
        return
      }

      const activeSession = exportReadiness.session
      const activeSourceFile = exportReadiness.sourceFile
      const activeRawRenderExposure = exportReadiness.rawRenderExposure
      const exportCapability = exportReadiness.fullResCapability

      const graph = resolveExportColorGraph({
        styleKind: params.styleKind,
        intensity: params.intensity,
        builtinPreset: params.builtinPreset,
        lut: lutDataRef.current,
        rawRenderExposure: activeRawRenderExposure,
        userExposureEv: params.userExposureEv,
        userContrast: params.userContrast,
        userHighlights: params.userHighlights,
        userShadows: params.userShadows,
        userWhites: params.userWhites,
        userBlacks: params.userBlacks,
      })

      if (!graph.supported) {
        setError(graph.message)
        setStatus('error')
        setSession((prev) =>
          prev
            ? {
                ...prev,
                exportState: {
                  ...prev.exportState,
                  status: 'failed',
                  result: undefined,
                  lastErrorCode: 'EXPORT_UNSUPPORTED_PIPELINE',
                  retryRecommended: false,
                  recommendedRetryLevel: undefined,
                },
              }
            : prev,
        )
        return
      }
      const graphFingerprint = JSON.stringify(graph.steps)

      const exportSessionId = activeSession.id
      const exportGraphVersion = exportGraphVersionRef.current
      abortExportWork()
      const exportAbortController = new AbortController()
      exportAbortControllerRef.current = exportAbortController

      const isCurrentExport = () =>
        isMountedRef.current &&
        !exportAbortController.signal.aborted &&
        exportGraphVersionRef.current === exportGraphVersion &&
        sessionRef.current?.id === exportSessionId

      try {
        setStatus('exporting')
        setProgress(0)
        setError(null)
        previewCopyCanvasRef.current = null
        const executionPlan = selectCurrentExportExecutionPlan({
          fidelity,
          sourceWidth: exportCapability.width,
          sourceHeight: exportCapability.height,
          previousInterrupted,
        })
        let jobExecutionPlan = executionPlan
        let checkpointStore: ReturnType<typeof createCheckpointStore> | null =
          null
        let checkpointManifest: ExportCheckpointManifest | null = null
        let checkpoint: FullResWorkerCheckpointConfig | undefined
        let checkpointWritesClosed = false
        let checkpointWriteChain: Promise<void> = Promise.resolve()

        const enqueueCheckpointWrite = (manifest: ExportCheckpointManifest) => {
          if (!checkpointStore || checkpointWritesClosed) {
            return
          }

          const nextManifest = manifest
          checkpointWriteChain = checkpointWriteChain
            .catch(() => undefined)
            .then(() => checkpointStore?.writeActive(nextManifest))
            .then(() => {
              emitExportDebugEvent({
                type: 'checkpoint-written',
                payload: {
                  exportId: nextManifest.exportId,
                  completedRowsForDiagnostics:
                    nextManifest.completedRowsForDiagnostics,
                  totalRows: nextManifest.totalRows,
                  updatedAt: nextManifest.updatedAt,
                },
              })
            })
            .then(
              () => undefined,
              () => undefined,
            )
        }

        if (
          executionPlan.profile.checkpointOutput &&
          executionPlan.outputSink === 'opfs-file'
        ) {
          try {
            checkpointStore = createCheckpointStore(
              createOpfsCheckpointBackend(),
            )
            const exportId = createExportId()
            const sourceFingerprint = await createSourceFingerprint(
              activeSourceFile,
              {
                width: exportCapability.width,
                height: exportCapability.height,
              },
            )
            checkpointManifest = createSafeRetryManifest({
              exportId,
              file: activeSourceFile,
              sourceFingerprint,
              outputWidth: exportCapability.width,
              outputHeight: exportCapability.height,
              graphFingerprint,
              profile: executionPlan.profile.name,
              preferredRows: executionPlan.preferredRows,
              outputSink: executionPlan.outputSink,
            })
            await checkpointStore.writeActive(checkpointManifest)
            if (isCurrentExport()) {
              emitExportDebugEvent({
                type: 'checkpoint-written',
                payload: {
                  exportId,
                  completedRowsForDiagnostics:
                    checkpointManifest.completedRowsForDiagnostics,
                  totalRows: checkpointManifest.totalRows,
                  updatedAt: checkpointManifest.updatedAt,
                },
              })
            }
            checkpoint = {
              exportId,
              graphFingerprint,
              sourceFingerprint,
            }
          } catch {
            checkpointStore = null
            checkpointManifest = null
          }
        }

        if (!isCurrentExport()) {
          return
        }

        if (executionPlan.outputSink === 'opfs-file' && !checkpoint) {
          jobExecutionPlan = {
            ...executionPlan,
            outputSink: 'blob-handoff',
            productCopy: 'non-durable-checkpoint',
          }
        }
        if (previousInterrupted) {
          setDiscoveredRecoveryState({ status: 'none' })
        }
        const activePlan = {
          profileName: jobExecutionPlan.profile.name,
          preferredRows: jobExecutionPlan.preferredRows,
          concurrency: jobExecutionPlan.concurrency,
          runtimeMemoryProfile: jobExecutionPlan.runtimeMemoryProfile,
          outputSink: jobExecutionPlan.outputSink,
          checkpointMode: jobExecutionPlan.checkpointMode,
        }

        emitExportDebugEvent({
          type: 'export-plan-selected',
          payload: {
            profile: jobExecutionPlan.profile.name,
            preferredRows: jobExecutionPlan.preferredRows,
            concurrency: jobExecutionPlan.concurrency,
            runtimeMemoryProfile: jobExecutionPlan.runtimeMemoryProfile,
            checkpointMode: jobExecutionPlan.checkpointMode,
            outputSink: jobExecutionPlan.outputSink,
            checkpointDurableExpected:
              jobExecutionPlan.profile.checkpointOutput &&
              jobExecutionPlan.outputSink === 'opfs-file',
          },
        })

        setSession((prev) =>
          prev && prev.id === exportSessionId
            ? {
                ...prev,
                exportState: {
                  ...prev.exportState,
                  status: 'exporting',
                  qualityPreset: quality,
                  fidelityLevel: fidelity,
                  activePlan,
                  checkpointDurable: Boolean(checkpoint),
                  recovery: { status: 'none' },
                  result: undefined,
                  lastProgress: undefined,
                  retryRecommended: false,
                  recommendedRetryLevel: undefined,
                },
              }
            : prev,
        )

        let copyCapability = resolveExportCopyCapability()
        let previewCopyCanvas: HTMLCanvasElement | null = null
        if (copyCapability.mode === 'preview-size') {
          const pipeline = pipelineRef.current
          const previewSize = stats?.previewSize

          if (pipeline && previewSize) {
            try {
              previewCopyCanvas = await pipeline.renderToHiddenCanvas({
                width: previewSize.width,
                height: previewSize.height,
              })
            } catch {
              previewCopyCanvas = null
            }
          }

          if (!isCurrentExport()) {
            return
          }

          if (!previewCopyCanvas) {
            copyCapability = {
              mode: 'unavailable',
              reason: 'Preview image is not ready to copy.',
            }
          }
        }

        if (jobExecutionPlan.profile.releasePreviewPipelineBeforeExport) {
          registerCurrentPreviewPipelineForEvacuation()
        }
        const snapshot = createPreExportSnapshot({
          file: activeSourceFile,
          metadata: loadedImage.metadata,
          graph,
          graphFingerprint,
          lutTitle:
            activeSession.activeStyle?.kind === 'custom'
              ? activeSession.activeStyle.name
              : undefined,
          quickPreviewReady:
            activeSession.previewBundle.quickDecodePreview.status === 'ready',
          tone: {
            userExposureEv: params.userExposureEv,
            userContrast: params.userContrast,
            userHighlights: params.userHighlights,
            userShadows: params.userShadows,
            userWhites: params.userWhites,
            userBlacks: params.userBlacks,
          },
          style: activeSession.activeStyle,
        })
        const registry = resourceRegistryRef.current
        if (!registry) {
          throw Object.assign(new Error('EXPORT_RESOURCE_REGISTRY_MISSING'), {
            code: 'EXPORT_RESOURCE_REGISTRY_MISSING',
          })
        }

        const evacuationOwners = getPreExportEvacuationOwners(
          jobExecutionPlan.profile.name,
        )
        const evacuation = await evacuateBeforeExport({
          registry,
          snapshot,
          owners: evacuationOwners,
          abortPreview: () => {
            abortRuntimeWork()
            revokeCurrentEmbeddedPreviewUrl()
          },
          abortBoundedHq: abortRuntimeWork,
          releasePreviousExportResult() {
            setSession((prev) =>
              prev && prev.id === exportSessionId
                ? clearExportResultForActiveExport(prev)
                : prev,
            )
          },
          stopLutFetches() {
            // Online LUT fetches already use per-request abort signals. This hook keeps
            // the owner contract explicit for future registered LUT fetch resources.
          },
        })

        if (!isCurrentExport()) {
          return
        }

        emitExportDebugEvent({
          type: 'resource-evacuated',
          payload: toResourceEvacuatedDebugPayload({
            profile: jobExecutionPlan.profile.name,
            evacuation,
          }),
        })

        if (!evacuation.registryCheck.ok) {
          throw Object.assign(
            new Error('EXPORT_RESOURCE_EVICTION_INCOMPLETE'),
            {
              code: 'EXPORT_RESOURCE_EVICTION_INCOMPLETE',
            },
          )
        }

        const filename = buildExportFilename(
          activeSession.sourceFile.name,
          activeSession.activeStyle?.name ?? 'neutral',
        )

        const result = await runFullResolutionExportJob({
          file: activeSourceFile,
          filename,
          quality: quality === 'high' ? 0.92 : 0.86,
          executionPlan: jobExecutionPlan,
          checkpoint,
          graph,
          onMetric: (metric) => {
            if (
              !checkpointStore ||
              !checkpointManifest ||
              checkpointWritesClosed ||
              !isCheckpointMetric(metric)
            ) {
              return
            }

            checkpointManifest = {
              ...checkpointManifest,
              completedRowsForDiagnostics: metric.completedRowsForDiagnostics,
              totalRows: metric.totalRows,
              updatedAt: metric.timestamp,
            }
            enqueueCheckpointWrite(checkpointManifest)
          },
          onAttempt: (attempt) => {
            if (!isCurrentExport()) return

            emitExportDebugEvent({
              type: 'export-worker-attempt',
              payload: attempt,
            })
          },
          onProgress: (entry) => {
            if (
              !isMountedRef.current ||
              exportAbortController.signal.aborted ||
              exportGraphVersionRef.current !== exportGraphVersion ||
              sessionRef.current?.id !== exportSessionId
            ) {
              return
            }

            setProgress(entry.progress)
            setSession((prev) =>
              prev && prev.id === exportSessionId
                ? {
                    ...prev,
                    exportState: {
                      ...prev.exportState,
                      lastProgress: {
                        completedStrips: entry.completedStrips,
                        totalStrips: entry.totalStrips,
                      },
                    },
                  }
                : prev,
            )
          },
          signal: exportAbortController.signal,
        })

        const completedSession = sessionRef.current
        if (
          !isMountedRef.current ||
          exportAbortController.signal.aborted ||
          exportGraphVersionRef.current !== exportGraphVersion ||
          !completedSession ||
          completedSession.id !== exportSessionId ||
          completedSession.exportState.fullResCapability.status !== 'supported'
        ) {
          return
        }
        const completedCapability =
          completedSession.exportState.fullResCapability

        if (checkpointStore && checkpoint) {
          checkpointWritesClosed = true
          await checkpointWriteChain.catch(() => undefined)
          await checkpointStore
            .removeActiveManifest(checkpoint.exportId)
            .catch(() => undefined)
          if (recoveredExportId && recoveredExportId !== checkpoint.exportId) {
            await checkpointStore
              .removeActiveManifest(recoveredExportId)
              .catch(() => undefined)
          }
        }

        const exportResult = createCompletedExportResult({
          jobResult: result,
          metadata: loadedImage.metadata,
          width: completedCapability.width,
          height: completedCapability.height,
          copyCapability,
        })
        previewCopyCanvasRef.current = previewCopyCanvas
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
                  lastSuccessfulSize: {
                    width: completedCapability.width,
                    height: completedCapability.height,
                  },
                },
              }
            : prev,
        )
        setStatus('ready')
        scheduleToast(() =>
          toast.success('JPEG ready', {
            description: result.filename,
          }),
        )
      } catch (err) {
        if (
          exportAbortController.signal.aborted ||
          !isMountedRef.current ||
          exportGraphVersionRef.current !== exportGraphVersion ||
          sessionRef.current?.id !== exportSessionId
        ) {
          return
        }

        const message = err instanceof Error ? err.message : 'Export failed'
        const rawErrorCode = toUserFacingErrorCode(
          getStableErrorCode(err) ?? message,
        )
        const errorCode =
          rawErrorCode === 'RAW_UNKNOWN' ? 'EXPORT_RENDER_FAILED' : rawErrorCode
        const retryLevel = isRetryableFullResExportFailure(errorCode)
          ? recommendRetryLevel(fidelity)
          : null

        setSession((prev) =>
          prev && prev.id === exportSessionId
            ? {
                ...prev,
                exportState: {
                  ...prev.exportState,
                  status: 'failed',
                  result: undefined,
                  lastErrorCode: errorCode,
                  retryRecommended: Boolean(retryLevel),
                  recommendedRetryLevel: retryLevel ?? undefined,
                },
              }
            : prev,
        )
        setStatus('ready')
        scheduleToast(() =>
          toast.error('Export failed', {
            description: buildExportFailureDescription(message, retryLevel),
          }),
        )
      } finally {
        if (exportAbortControllerRef.current === exportAbortController) {
          exportAbortControllerRef.current = null
        }
      }
    },
    [
      abortExportWork,
      abortRuntimeWork,
      loadedImage.file,
      loadedImage.metadata,
      params.builtinPreset,
      params.intensity,
      params.styleKind,
      params.userBlacks,
      params.userContrast,
      params.userExposureEv,
      params.userHighlights,
      params.userShadows,
      params.userWhites,
      registerCurrentPreviewPipelineForEvacuation,
      registerExportResultResource,
      revokeCurrentEmbeddedPreviewUrl,
      scheduleToast,
      session,
      setDiscoveredRecoveryState,
      setError,
      setProgress,
      setSession,
      setStatus,
      stats?.previewSize,
    ],
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
    ? resolveExportShareCapability(exportResult)
    : { available: false as const, reason: 'Export a JPEG before sharing.' }
  const sessionRecovery = session?.exportState.recovery
  const exportRecovery =
    sessionRecovery && sessionRecovery.status !== 'none'
      ? sessionRecovery
      : discoveredRecovery
  const activeExportProfileName =
    session?.exportState.status === 'exporting'
      ? session.exportState.activePlan?.profileName
      : undefined
  const previewSuspended =
    status === 'exporting' &&
    Boolean(
      activeExportProfileName &&
      EXPORT_EXECUTION_PROFILES[activeExportProfileName]
        .releasePreviewPipelineBeforeExport,
    )

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
