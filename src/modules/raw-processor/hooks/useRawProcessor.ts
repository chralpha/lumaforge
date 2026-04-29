import type { LumaRawExportCapability } from '@lumaforge/luma-raw-runtime'
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
import type { LUTColorProfile } from '~/lib/color/registry'
import { getLUTColorProfile } from '~/lib/color/registry'
import { resolveExportColorGraph } from '~/lib/export/color-graph'
import type {
  LUTData,
  PipelineStats,
  ProcessingParams,
  RawProcessingPipeline,
} from '~/lib/gl/pipeline'
import type { ParsedLUT } from '~/lib/lut/cube-parser'
import {
  isSupportedLUT,
  parseCubeFile,
  toLUTData,
  validateLUT,
} from '~/lib/lut/cube-parser'
import {
  applyLUTContractSelection,
  toLUTContractSelection,
} from '~/lib/lut/profile-resolution'
import type { DecodedImage, ImageMetadata } from '~/lib/raw/decoder'
import { isSupportedRaw } from '~/lib/raw/decoder'
import type { RawRuntimeSession } from '~/lib/raw/runtime-adapter'
import { rawRuntimeAdapter } from '~/lib/raw/runtime-adapter'

import {
  deriveCanEdit,
  deriveCanExport,
  deriveExportDisabledReason,
  selectDisplaySource,
} from '../model/derive-session'
import type {
  ExportResult,
  ExportShareCapability,
} from '../model/export-result'
import { createExportResult } from '../model/export-result'
import type {
  DisplaySource,
  ImageSession,
  LUTProfileSelectionState,
  StyleAsset,
} from '../model/session'
import { BUILTIN_PRESETS } from '../services/builtin-presets'
import {
  copyBlobToClipboard,
  copyCanvasToClipboard,
  downloadExportResult as downloadStoredExportResult,
  resolveExportCopyCapability,
  resolveExportShareCapability,
  shareExportResult as shareStoredExportResult,
} from '../services/export-result-actions'
import {
  buildExportFilename,
  getConcurrencyForFidelity,
  getPreferredRowsForFidelity,
  recommendRetryLevel,
  runFullResolutionExportJob,
} from '../services/export-system'
import { runPreviewPipeline } from '../services/preview-pipeline'
import { decideBoundedHqPreview } from '../services/preview-resolution-policy'
import {
  buildBuiltinStyle,
  buildLUTProfileSelectionState,
  mapIntensityLevel,
  toCustomStyle,
} from '../services/style-system'
import { classifySupportLevel } from '../services/support-matrix'
import { useImageSession } from './useImageSession'

function resolveLUTContractProfile(
  profile: LUTColorProfile | string,
): LUTColorProfile | undefined {
  if (typeof profile !== 'string') return profile

  const compact = profile.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (compact === 'vlog' || compact === 'vloginput') {
    return getLUTColorProfile('panasonic-vgamut-vlog')
  }
  if (compact === 'displaysrgb' || compact === 'srgbdisplay') {
    return getLUTColorProfile('display-srgb')
  }

  return getLUTColorProfile(profile)
}

function toUserFacingErrorCode(code: unknown) {
  if (typeof code === 'string' && code.startsWith('LUT_')) return code
  if (typeof code === 'string' && code.startsWith('EXPORT_')) return code
  if (typeof code === 'string' && code.startsWith('FULL_RES_EXPORT_')) {
    return code
  }
  if (typeof code === 'string' && code.startsWith('RAW_')) return code
  return 'RAW_UNKNOWN'
}

function getStableErrorCode(error: unknown) {
  if (typeof error !== 'object' || !error || !('code' in error)) {
    return undefined
  }

  return (error as { code?: unknown }).code
}

function toFullResCapabilityState(capability: LumaRawExportCapability) {
  if (
    capability.supported &&
    capability.strategy === 'libraw-processed-window' &&
    capability.windows.librawProcessed
  ) {
    return {
      status: 'supported' as const,
      width: capability.width,
      height: capability.height,
    }
  }

  return {
    status: 'unsupported' as const,
    reason: capability.supported
      ? 'processed-window-unavailable'
      : capability.reasons.join(', ') ||
        'This RAW source does not support full-resolution export in the current browser build.',
  }
}

function getProgressRecoveryHint(status: ProcessingStatus) {
  if (status === 'loading' || status === 'decoding') {
    return 'If HQ preview cannot finish, the first visible preview stays available while full-resolution export depends on processed-window support instead.'
  }

  if (status === 'processing') {
    return 'If the current render step fails, keep the session and retry the look without reloading the browser.'
  }

  if (status === 'exporting') {
    return 'Full-resolution export runs in strips. Keep this tab open until the JPEG finishes, then retry from the current session if needed.'
  }

  return undefined
}

function clampCompareSplit(split: number): number {
  return Math.min(0.95, Math.max(0.05, split))
}

function isRetryableFullResExportFailure(code: string) {
  return (
    code === 'FULL_RES_EXPORT_RESOURCE_FAILURE' ||
    code === 'FULL_RES_EXPORT_WORKER_FAILED'
  )
}

function buildExportFailureDescription(
  message: string,
  retryLevel: 'safe' | 'balanced' | null,
) {
  if (!retryLevel) {
    return message
  }

  return `${message}. Retry with ${retryLevel} fidelity.`
}

function copyToArrayBuffer(data: Uint8Array) {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return buffer
}

function enqueuePostCommitTask(task: () => void) {
  setTimeout(task, 0)
}

function clearExportResultState<T extends ImageSession | null>(session: T): T {
  if (
    !session?.exportState.result &&
    session?.exportState.status !== 'ready' &&
    session?.exportState.status !== 'exporting'
  ) {
    return session
  }

  return {
    ...session,
    exportState: {
      ...session.exportState,
      status:
        session.exportState.status === 'ready' ||
        session.exportState.status === 'exporting'
          ? 'idle'
          : session.exportState.status,
      result: undefined,
      lastProgress:
        session.exportState.status === 'exporting'
          ? undefined
          : session.exportState.lastProgress,
    },
  }
}

function hasSameRawRenderExposure(
  current: DecodedImage['renderExposure'] | null | undefined,
  next: DecodedImage['renderExposure'] | null | undefined,
) {
  if (!current || !next) {
    return current === next
  }

  return (
    current.ev === next.ev &&
    current.multiplier === next.multiplier &&
    current.source === next.source
  )
}

function changesRenderGraphParams(
  current: ProcessingParams,
  next: Partial<ProcessingParams>,
) {
  return (
    (Object.hasOwn(next, 'styleKind') &&
      next.styleKind !== current.styleKind) ||
    (Object.hasOwn(next, 'builtinPreset') &&
      next.builtinPreset !== current.builtinPreset) ||
    (Object.hasOwn(next, 'intensity') && next.intensity !== current.intensity)
  )
}

const MISSING_RAW_RENDER_EXPOSURE_EXPORT_REASON =
  'RAW preview exposure is still being prepared.'

function isFullResExportRunnable(input: {
  sourceFile: File | null
  session: ImageSession
  rawRenderExposure: DecodedImage['renderExposure'] | null | undefined
}) {
  return (
    Boolean(input.sourceFile) &&
    Boolean(input.rawRenderExposure) &&
    deriveCanExport(input.session)
  )
}

function resolveHookExportDisabledReason(input: {
  sourceFile: File | null
  session: ImageSession | null
  rawRenderExposure: DecodedImage['renderExposure'] | null | undefined
}) {
  if (!input.sourceFile || !input.session) {
    return 'Full-resolution export source is still loading.'
  }

  const sessionReason = deriveExportDisabledReason(input.session)
  if (sessionReason) return sessionReason

  if (!input.rawRenderExposure) {
    return MISSING_RAW_RENDER_EXPOSURE_EXPORT_REASON
  }

  return undefined
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
  activeStyle: StyleAsset | null
  lutProfileSelection: LUTProfileSelectionState | null
  activePresetId: (typeof BUILTIN_PRESETS)[number]['id'] | null
  activeIntensity: 'off' | 'light' | 'standard' | 'strong'
  viewMode: ProcessingParams['viewMode']
  compareSplit: number
  currentLutName: string | null
  sourceFileName: string
  supportLevel: 'official' | 'experimental'
  progressRecoveryHint?: string
  presetOptions: typeof BUILTIN_PRESETS
  embeddedPreviewUrl: string | null
  displaySource: DisplaySource

  // Actions
  loadFile: (file: File) => Promise<void>
  loadLUT: (file: File) => Promise<void>
  selectLUTProfile: (profile: LUTColorProfile | string) => void
  selectBuiltinStyle: (id: (typeof BUILTIN_PRESETS)[number]['id']) => void
  selectIntensityLevel: (level: 'off' | 'light' | 'standard' | 'strong') => void
  setViewMode: (mode: ProcessingParams['viewMode']) => void
  setCompareSplit: (split: number) => void
  clearLUT: () => void
  setParams: (params: Partial<ProcessingParams>) => void
  exportImage: (options: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
  }) => Promise<void>
  downloadExportResult: () => void
  shareExportResult: () => Promise<void>
  copyExportResult: () => Promise<void>
  reset: () => void
  dismissError: () => void
  updateStats: (stats: PipelineStats) => void

  // Pipeline ref for export
  pipelineRef: React.RefObject<RawProcessingPipeline | null>
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
  const hasImage = session ? deriveCanEdit(session) : false
  const rawRenderExposure = decodedImageRef.current?.renderExposure ?? null
  const canExport = session
    ? isFullResExportRunnable({
        sourceFile: loadedImage.file,
        session,
        rawRenderExposure,
      })
    : false
  const exportDisabledReason = !canExport
    ? resolveHookExportDisabledReason({
        sourceFile: loadedImage.file,
        session,
        rawRenderExposure,
      })
    : undefined
  const activeStyle = session?.activeStyle || null
  const lutProfileSelection = session?.lutProfileSelection || null
  const activePresetId =
    activeStyle?.kind === 'builtin'
      ? (BUILTIN_PRESETS.find((preset) => preset.name === activeStyle.name)
          ?.id ?? null)
      : null
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

        const previewBundle = {
          ...prev.previewBundle,
          embeddedPreview: { status: 'idle' as const },
        }

        return {
          ...prev,
          previewBundle: {
            ...previewBundle,
            displaySource: selectDisplaySource(previewBundle),
          },
        }
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

    for (const url of urls) {
      URL.revokeObjectURL?.(url)
    }

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

  const invalidateExportGraph = useCallback(() => {
    exportGraphVersionRef.current += 1
    const hasActiveExport =
      Boolean(
        exportAbortControllerRef.current &&
        !exportAbortControllerRef.current.signal.aborted,
      ) || sessionRef.current?.exportState.status === 'exporting'

    abortExportWork()
    setSession(clearExportResultState)

    if (hasActiveExport) {
      setStatus('ready')
      setProgress(0)
    }
  }, [abortExportWork, setProgress, setSession, setStatus])

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
    isMountedRef.current = true

    return () => {
      const pendingLoadSessionId = pendingLoadSessionIdRef.current
      isMountedRef.current = false
      runtimeWorkSessionIdRef.current = null
      pendingLoadSessionIdRef.current = null
      abortExportWork()
      abortRuntimeWork()
      revokeCurrentEmbeddedPreviewUrl()
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
    revokeCurrentEmbeddedPreviewUrl,
    abortRuntimeWork,
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
        abortExportWork()
        abortRuntimeWork()
        revokeCurrentEmbeddedPreviewUrl()
        runtimeAbortController = new AbortController()
        runtimeAbortControllerRef.current = runtimeAbortController
        const runtimeSignal = runtimeAbortController.signal
        const preservedCompareSplit = clampCompareSplit(
          getProcessingParams().compareSplit ?? 0.5,
        )

        const nextSession = replaceFile(file)
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
        setLut(null)
        setLutDataRef(null)
        setParams((prev) => ({
          ...prev,
          intensity: 0.7,
          viewMode: 'compare',
          compareSplit: preservedCompareSplit,
          styleKind: 'none',
          builtinPreset: null,
        }))

        setSession((prev) => {
          if (!prev || prev.id !== nextSession.id) {
            return prev
          }

          return {
            ...prev,
            viewState: {
              ...prev.viewState,
              mode: 'compare',
              compareSplit: preservedCompareSplit,
            },
            previewBundle: {
              ...prev.previewBundle,
              quickDecodePreview: { status: 'loading' },
              boundedHqPreview: { status: 'loading' },
            },
            renderState: {
              status: 'preparing',
            },
            exportState: {
              ...prev.exportState,
              fullResCapability: { status: 'probing' },
            },
          }
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

            const previewBundle = {
              ...prev.previewBundle,
              embeddedPreview:
                source === 'embedded'
                  ? {
                      status: 'ready' as const,
                      width: payload.width,
                      height: payload.height,
                      objectUrl: payload.objectUrl,
                      mimeType: payload.mimeType,
                      timings: payload.timings,
                    }
                  : prev.previewBundle.embeddedPreview,
              quickDecodePreview:
                source === 'quick'
                  ? {
                      status: 'ready' as const,
                      width: payload.width,
                      height: payload.height,
                      timings: payload.timings ?? decoded?.timings,
                    }
                  : prev.previewBundle.quickDecodePreview,
              boundedHqPreview:
                source === 'bounded-hq'
                  ? {
                      status: 'ready' as const,
                      width: payload.width,
                      height: payload.height,
                      timings: payload.timings ?? decoded?.timings,
                    }
                  : prev.previewBundle.boundedHqPreview,
            }

            return {
              ...prev,
              sourceFile: decoded
                ? {
                    ...prev.sourceFile,
                    cameraBrand: decoded.metadata.make,
                    cameraModel: decoded.metadata.model,
                    rawFormat: prev.sourceFile.extension,
                    width: decoded.width,
                    height: decoded.height,
                    supportLevel: classifySupportLevel({
                      cameraBrand: decoded.metadata.make,
                      cameraModel: decoded.metadata.model,
                      rawFormat: prev.sourceFile.extension,
                    }),
                  }
                : prev.sourceFile,
              previewBundle: {
                ...previewBundle,
                displaySource: selectDisplaySource(previewBundle),
              },
              renderState: {
                status: 'ready',
                lastRenderSource: source,
              },
            }
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
                const objectUrl = URL.createObjectURL(
                  new Blob([copyToArrayBuffer(event.data)], {
                    type: event.mimeType,
                  }),
                )
                const previousUrl = embeddedPreviewUrlRef.current
                if (previousUrl && previousUrl !== objectUrl) {
                  URL.revokeObjectURL(previousUrl)
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

                  const previewBundle = {
                    ...prev.previewBundle,
                    quickDecodePreview: {
                      status: 'failed' as const,
                      errorCode,
                    },
                    boundedHqPreview: {
                      status: 'failed' as const,
                      errorCode,
                    },
                  }

                  return {
                    ...prev,
                    previewBundle: {
                      ...previewBundle,
                      displaySource: selectDisplaySource(previewBundle),
                    },
                    renderState: {
                      ...prev.renderState,
                      status: 'failed',
                      lastErrorCode: errorCode,
                    },
                    exportState: {
                      ...prev.exportState,
                      fullResCapability: {
                        status: 'unsupported',
                        reason: 'Quick preview did not complete.',
                      },
                    },
                  }
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

                  const previewBundle = {
                    ...prev.previewBundle,
                    boundedHqPreview: {
                      status: 'failed' as const,
                      errorCode,
                    },
                  }

                  return {
                    ...prev,
                    previewBundle: {
                      ...previewBundle,
                      displaySource: selectDisplaySource(previewBundle),
                    },
                  }
                })
                break
              }
              case 'bounded-hq-skipped': {
                setSession((prev) => {
                  if (!prev || prev.id !== nextSession.id) {
                    return prev
                  }

                  const previewBundle = {
                    ...prev.previewBundle,
                    boundedHqPreview: {
                      status: 'skipped' as const,
                      reason: event.reason,
                    },
                  }

                  return {
                    ...prev,
                    previewBundle: {
                      ...previewBundle,
                      displaySource: selectDisplaySource(previewBundle),
                    },
                  }
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
      abortExportWork,
      abortRuntimeWork,
      disposeRuntimeSession,
      replaceFile,
      revokeCurrentEmbeddedPreviewUrl,
      scheduleToast,
      setDecodedImageRef,
      setError,
      setLoadedImage,
      setLut,
      setLutDataRef,
      setParams,
      setProgress,
      setSession,
      setStatus,
    ],
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
        const parsed = await parseCubeFile(file)
        const validation = validateLUT(parsed)
        if (!validation.valid) {
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  renderState: {
                    ...prev.renderState,
                    lastErrorCode: 'LUT_INVALID',
                  },
                }
              : prev,
          )
          scheduleToast(() =>
            toast.error('Failed to load LUT', {
              description: validation.errors[0] || 'Invalid LUT',
            }),
          )
          return
        }

        const style = toCustomStyle(parsed)
        invalidateExportGraph()
        setLut(parsed)
        setSession((prev) =>
          prev
            ? clearExportResultState({
                ...prev,
                activeStyle: style,
                lutProfileSelection: buildLUTProfileSelectionState(parsed),
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
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to parse LUT'
        const errorCode =
          toUserFacingErrorCode(message) === 'RAW_UNKNOWN'
            ? 'LUT_PARSE_FAILED'
            : toUserFacingErrorCode(message)
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
      }
    },
    [invalidateExportGraph, scheduleToast, setLut, setParams, setSession],
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

      const baseStyle = toCustomStyle(updatedLut)
      const currentIntensityLevel =
        activeStyle?.kind === 'custom'
          ? activeStyle.currentIntensityLevel
          : baseStyle.currentIntensityLevel
      const style = {
        ...baseStyle,
        currentIntensityLevel,
      }

      setLut(updatedLut)
      invalidateExportGraph()
      setSession((prev) =>
        prev
          ? clearExportResultState({
              ...prev,
              activeStyle: style,
              lutProfileSelection: buildLUTProfileSelectionState(updatedLut),
            })
          : prev,
      )
      setParams((prev) => ({
        ...prev,
        styleKind: 'custom',
        builtinPreset: null,
        intensity: mapIntensityLevel(currentIntensityLevel),
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

  const selectBuiltinStyle = useCallback(
    (id: (typeof BUILTIN_PRESETS)[number]['id']) => {
      const style = buildBuiltinStyle(id)
      invalidateExportGraph()
      setLut(null)
      setLutDataRef(null)
      setSession((prev) =>
        prev
          ? clearExportResultState({
              ...prev,
              activeStyle: style,
              lutProfileSelection: undefined,
            })
          : prev,
      )
      setParams((prev) => ({
        ...prev,
        styleKind: 'builtin',
        builtinPreset: id,
        intensity: mapIntensityLevel(style.defaultIntensityLevel),
      }))
    },
    [invalidateExportGraph, setLut, setLutDataRef, setParams, setSession],
  )

  const selectIntensityLevel = useCallback(
    (level: 'off' | 'light' | 'standard' | 'strong') => {
      invalidateExportGraph()
      setParams((prev) => ({ ...prev, intensity: mapIntensityLevel(level) }))
      setSession((prev) => {
        if (!prev) {
          return prev
        }

        if (!prev.activeStyle) {
          return clearExportResultState(prev)
        }

        return clearExportResultState({
          ...prev,
          activeStyle: {
            ...prev.activeStyle,
            currentIntensityLevel: level,
          },
        })
      })
    },
    [invalidateExportGraph, setParams, setSession],
  )

  const setViewMode = useCallback(
    (mode: ProcessingParams['viewMode']) => {
      setParams((prev) => ({ ...prev, viewMode: mode }))
      setSession((prev) => {
        if (!prev) {
          return prev
        }

        return {
          ...prev,
          viewState: {
            ...prev.viewState,
            mode,
          },
        }
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
        return {
          ...prev,
          viewState: {
            ...prev.viewState,
            compareSplit: nextSplit,
          },
        }
      })
    },
    [setParams, setSession],
  )

  // Clear LUT
  const clearLUT = useCallback(() => {
    invalidateExportGraph()
    setLut(null)
    setLutDataRef(null)
    setSession((prev) =>
      prev
        ? clearExportResultState({
            ...prev,
            activeStyle: null,
            lutProfileSelection: undefined,
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
    invalidateExportGraph,
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

  // Export image
  const exportImage = useCallback(
    async ({
      quality,
      fidelity,
    }: {
      quality: 'standard' | 'high'
      fidelity: 'safe' | 'balanced' | 'max'
    }) => {
      const rawRenderExposure = decodedImageRef.current?.renderExposure ?? null
      if (
        !session ||
        !loadedImage.file ||
        !rawRenderExposure ||
        !isFullResExportRunnable({
          sourceFile: loadedImage.file,
          session,
          rawRenderExposure,
        })
      ) {
        const description = resolveHookExportDisabledReason({
          sourceFile: loadedImage.file,
          session,
          rawRenderExposure,
        })
        scheduleToast(() =>
          toast.error(
            'Full-resolution export is not ready',
            description ? { description } : undefined,
          ),
        )
        return
      }

      if (session.exportState.fullResCapability.status !== 'supported') {
        scheduleToast(() =>
          toast.error(
            session.exportState.fullResCapability.status === 'unsupported'
              ? session.exportState.fullResCapability.reason
              : 'Full-resolution export support is still being checked.',
          ),
        )
        return
      }

      const graph = resolveExportColorGraph({
        styleKind: params.styleKind,
        intensity: params.intensity,
        builtinPreset: params.builtinPreset,
        lut: lutDataRef.current,
        rawRenderExposure,
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

      const exportSessionId = session.id
      const exportGraphVersion = exportGraphVersionRef.current
      abortExportWork()
      const exportAbortController = new AbortController()
      exportAbortControllerRef.current = exportAbortController

      try {
        setStatus('exporting')
        setProgress(0)
        setError(null)

        setSession((prev) =>
          prev
            ? {
                ...prev,
                exportState: {
                  ...prev.exportState,
                  status: 'exporting',
                  qualityPreset: quality,
                  fidelityLevel: fidelity,
                  result: undefined,
                  lastProgress: undefined,
                  retryRecommended: false,
                  recommendedRetryLevel: undefined,
                },
              }
            : prev,
        )

        const filename = buildExportFilename(
          session.sourceFile.name,
          session.activeStyle?.name ?? 'neutral',
        )

        const result = await runFullResolutionExportJob({
          file: loadedImage.file,
          filename,
          quality: quality === 'high' ? 0.92 : 0.86,
          preferredRows: getPreferredRowsForFidelity(fidelity),
          concurrency: getConcurrencyForFidelity(fidelity),
          graph,
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

        const activeSession = sessionRef.current
        if (
          !isMountedRef.current ||
          exportAbortController.signal.aborted ||
          exportGraphVersionRef.current !== exportGraphVersion ||
          !activeSession ||
          activeSession.id !== exportSessionId ||
          activeSession.exportState.fullResCapability.status !== 'supported'
        ) {
          return
        }
        const completedCapability = activeSession.exportState.fullResCapability

        const exportResult = createExportResult({
          blob: result.blob,
          filename: result.filename,
          width: completedCapability.width,
          height: completedCapability.height,
          copyCapability: resolveExportCopyCapability(),
        })

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
      loadedImage.file,
      params.builtinPreset,
      params.intensity,
      params.styleKind,
      scheduleToast,
      session,
      setError,
      setProgress,
      setSession,
      setStatus,
    ],
  )

  const downloadExportResult = useCallback(() => {
    const result = sessionRef.current?.exportState.result
    if (!result) return

    try {
      downloadStoredExportResult(result)
    } catch (err) {
      const description =
        err instanceof Error ? err.message : 'Download action failed.'
      scheduleToast(() =>
        toast.error('Download failed', {
          description,
        }),
      )
    }
  }, [scheduleToast])

  const shareExportResult = useCallback(async () => {
    const result = sessionRef.current?.exportState.result
    if (!result) return

    try {
      await shareStoredExportResult(result)
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
  }, [scheduleToast])

  const copyExportResult = useCallback(async () => {
    const result = sessionRef.current?.exportState.result
    if (!result) return

    try {
      if (result.copyCapability.mode === 'full-resolution') {
        await copyBlobToClipboard(result.blob)
        scheduleToast(() => toast.success('Full-resolution image copied'))
        return
      }

      if (result.copyCapability.mode === 'preview-size') {
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
  }, [scheduleToast, stats?.previewSize])

  // Reset state
  const reset = useCallback(() => {
    runtimeWorkSessionIdRef.current = null
    pendingLoadSessionIdRef.current = null
    abortExportWork()
    abortRuntimeWork()
    revokeCurrentEmbeddedPreviewUrl()
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
    resetSession,
    abortRuntimeWork,
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
    activeStyle,
    lutProfileSelection,
    activePresetId,
    activeIntensity,
    viewMode,
    compareSplit,
    currentLutName,
    sourceFileName,
    supportLevel,
    progressRecoveryHint,
    presetOptions: BUILTIN_PRESETS,
    embeddedPreviewUrl,
    displaySource,
    loadFile,
    loadLUT,
    selectLUTProfile,
    selectBuiltinStyle,
    selectIntensityLevel,
    setViewMode,
    setCompareSplit,
    clearLUT,
    setParams: handleSetParams,
    exportImage,
    downloadExportResult,
    shareExportResult,
    copyExportResult,
    reset,
    dismissError,
    updateStats,
    pipelineRef,
  }
}
