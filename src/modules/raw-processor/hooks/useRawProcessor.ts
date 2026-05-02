import type {
  LUTColorProfile,
  LUTContractSelection,
  LUTData,
  ProcessingParams,
} from '@lumaforge/luma-color-runtime'
import {
  getLUTColorProfile,
  normalizeToneParams,
  resolveExportColorGraph,
} from '@lumaforge/luma-color-runtime'
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
import type { ExportCheckpointManifest } from '~/lib/export/checkpoint-store'
import {
  createCheckpointStore,
  createOpfsCheckpointBackend,
} from '~/lib/export/checkpoint-store'
import { emitExportDebugEvent } from '~/lib/export/execution-profile'
import type {
  FullResWorkerCheckpointConfig,
  FullResWorkerCheckpointMetric,
} from '~/lib/export/full-res-export-client'
import type { JpegExportMetadata } from '~/lib/export/jpeg-metadata'
import { preserveJpegMetadata } from '~/lib/export/jpeg-metadata'
import type { ExportOutputResult } from '~/lib/export/output-sink'
import { createBlobOutputResult } from '~/lib/export/output-sink'
import type {
  ResourceRegistry,
  ResourceRegistryCheck,
} from '~/lib/export/resource-registry'
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
  ExportRecoveryState,
  ImageSession,
  LUTProfileSelectionState,
  StyleAsset,
} from '../model/session'
import { BUILTIN_PRESETS } from '../services/builtin-presets'
import {
  createPreExportSnapshot,
  evacuateBeforeExport,
} from '../services/export-evacuation'
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
import {
  buildExportFilename,
  recommendRetryLevel,
  runFullResolutionExportJob,
  selectCurrentExportExecutionPlan,
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

function resolveOnlineLUTSourceName(entry: OnlineLUTEntry): string {
  if (entry.title) return entry.title

  try {
    const pathname = new URL(entry.cube.url).pathname
    const fileName = pathname.split('/').filter(Boolean).at(-1)
    if (fileName) return fileName
  } catch {
    // Fall back to the original URL below.
  }

  return entry.cube.url
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
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

function createExportId() {
  return globalThis.crypto?.randomUUID?.() ?? `export-${Date.now()}`
}

function createSafeRetryManifest(input: {
  exportId: string
  file: File
  sourceFingerprint: ExportCheckpointManifest['sourceFingerprint']
  outputWidth: number
  outputHeight: number
  graphFingerprint: string
  profile: ExportCheckpointManifest['profile']
  preferredRows: number
  outputSink: ExportCheckpointManifest['outputSink']
  completedRowsForDiagnostics?: number
  updatedAt?: string
}): ExportCheckpointManifest {
  return {
    version: 1,
    exportId: input.exportId,
    sourceFingerprint: input.sourceFingerprint,
    fileName: input.file.name,
    sourceSize: input.file.size,
    sourceLastModified: input.file.lastModified,
    outputWidth: input.outputWidth,
    outputHeight: input.outputHeight,
    graphFingerprint: input.graphFingerprint,
    profile: input.profile,
    attempt: 1,
    preferredRows: input.preferredRows,
    totalRows: input.outputHeight,
    recoveryMode: 'safe-retry',
    outputSink: input.outputSink,
    sourceReacquisition: 'user-reselect-required',
    completedRowsForDiagnostics: input.completedRowsForDiagnostics ?? 0,
    jpegState: 'restart-required',
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  }
}

function isCheckpointMetric(
  metric: unknown,
): metric is FullResWorkerCheckpointMetric {
  return (
    typeof metric === 'object' &&
    metric !== null &&
    'kind' in metric &&
    metric.kind === 'checkpoint'
  )
}

function toDebugRegistryCheck(check: ResourceRegistryCheck) {
  if (check.ok) return { ok: true }

  return {
    ok: false,
    live: check.live.map(({ id, owner, kind }) => ({
      id,
      owner,
      kind,
    })),
  }
}

function withLazyJpegMetadata(input: {
  output: ExportOutputResult
  metadata: unknown
  width: number
  height: number
}): ExportOutputResult {
  if (input.output.kind !== 'file-backed') {
    return input.output
  }

  const output = input.output
  return {
    ...output,
    async openBlob() {
      return preserveJpegMetadata({
        jpeg: await output.openBlob(),
        metadata: input.metadata as JpegExportMetadata | null | undefined,
        width: input.width,
        height: input.height,
      })
    },
  }
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

function clearExportResultForActiveExport(session: ImageSession): ImageSession {
  return {
    ...session,
    exportState: {
      ...session.exportState,
      result: undefined,
      lastProgress: undefined,
      retryRecommended: false,
      recommendedRetryLevel: undefined,
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
    (Object.hasOwn(next, 'intensity') &&
      next.intensity !== current.intensity) ||
    (Object.hasOwn(next, 'userExposureEv') &&
      next.userExposureEv !== current.userExposureEv) ||
    (Object.hasOwn(next, 'userContrast') &&
      next.userContrast !== current.userContrast)
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
  exportRecovery: ExportRecoveryState
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
  loadOnlineLUT: (
    entry: OnlineLUTEntry,
    options?: { signal?: AbortSignal },
  ) => Promise<void>
  selectLUTProfile: (profile: LUTColorProfile | string) => void
  selectBuiltinStyle: (id: (typeof BUILTIN_PRESETS)[number]['id']) => void
  selectIntensityLevel: (level: 'off' | 'light' | 'standard' | 'strong') => void
  setViewMode: (mode: ProcessingParams['viewMode']) => void
  setCompareSplit: (split: number) => void
  clearLUT: () => void
  setParams: (params: Partial<ProcessingParams>) => void
  setToneParams: (
    params: Partial<Pick<ProcessingParams, 'userExposureEv' | 'userContrast'>>,
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
        const preservedCompareSplit = clampCompareSplit(
          getProcessingParams().compareSplit ?? 0.5,
        )
        const preservedCustomStyle = lut
          ? {
              ...toCustomStyle(lut),
              currentIntensityLevel:
                activeStyle?.kind === 'custom'
                  ? activeStyle.currentIntensityLevel
                  : ('standard' as const),
            }
          : null
        const preservedLutProfileSelection = lut
          ? buildLUTProfileSelectionState(lut)
          : undefined

        const nextSession = replaceFile(file, {
          activeStyle: preservedCustomStyle,
          lutProfileSelection: preservedLutProfileSelection,
        })
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
          intensity: preservedCustomStyle
            ? mapIntensityLevel(preservedCustomStyle.currentIntensityLevel)
            : 0.7,
          viewMode: 'compare',
          compareSplit: preservedCompareSplit,
          styleKind: preservedCustomStyle ? 'custom' : 'none',
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
      const shouldInvalidateExportGraph =
        changesRenderGraphParams(params, {
          styleKind: 'builtin',
          builtinPreset: id,
          intensity: mapIntensityLevel(style.defaultIntensityLevel),
        }) ||
        activeStyle?.kind !== 'builtin' ||
        activeStyle.name !== style.name ||
        activeStyle.currentIntensityLevel !== style.defaultIntensityLevel ||
        Boolean(lut)

      if (shouldInvalidateExportGraph) {
        invalidateExportGraph()
      }
      setLut(null)
      setLutDataRef(null)
      setSession((prev) =>
        prev
          ? shouldInvalidateExportGraph
            ? clearExportResultState({
                ...prev,
                activeStyle: style,
                lutProfileSelection: undefined,
              })
            : {
                ...prev,
                activeStyle: style,
                lutProfileSelection: undefined,
              }
          : prev,
      )
      setParams((prev) => ({
        ...prev,
        styleKind: 'builtin',
        builtinPreset: id,
        intensity: mapIntensityLevel(style.defaultIntensityLevel),
      }))
    },
    [
      activeStyle,
      invalidateExportGraph,
      lut,
      params,
      setLut,
      setLutDataRef,
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

        if (!prev.activeStyle) {
          return shouldInvalidateExportGraph
            ? clearExportResultState(prev)
            : prev
        }

        const nextSession = {
          ...prev,
          activeStyle: {
            ...prev.activeStyle,
            currentIntensityLevel: level,
          },
        }

        return shouldInvalidateExportGraph
          ? clearExportResultState(nextSession)
          : nextSession
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
        ? shouldInvalidateExportGraph
          ? clearExportResultState({
              ...prev,
              activeStyle: null,
              lutProfileSelection: undefined,
            })
          : {
              ...prev,
              activeStyle: null,
              lutProfileSelection: undefined,
            }
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
        Pick<ProcessingParams, 'userExposureEv' | 'userContrast'>
      >,
    ) => {
      let shouldClearExportResult = false
      setParams((prev) => {
        const normalized = normalizeToneParams({
          userExposureEv: toneParams.userExposureEv ?? prev.userExposureEv,
          userContrast: toneParams.userContrast ?? prev.userContrast,
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
    handleSetParams({ userExposureEv: 0, userContrast: 0 })
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
      const exportCapability = session.exportState.fullResCapability

      const graph = resolveExportColorGraph({
        styleKind: params.styleKind,
        intensity: params.intensity,
        builtinPreset: params.builtinPreset,
        lut: lutDataRef.current,
        rawRenderExposure,
        userExposureEv: params.userExposureEv,
        userContrast: params.userContrast,
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

      const exportSessionId = session.id
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
              loadedImage.file,
              {
                width: exportCapability.width,
                height: exportCapability.height,
              },
            )
            checkpointManifest = createSafeRetryManifest({
              exportId,
              file: loadedImage.file,
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

        registerCurrentPreviewPipelineForEvacuation()
        const snapshot = createPreExportSnapshot({
          file: loadedImage.file,
          metadata: loadedImage.metadata,
          graph,
          graphFingerprint,
          lutTitle:
            session.activeStyle?.kind === 'custom'
              ? session.activeStyle.name
              : undefined,
          quickPreviewReady:
            session.previewBundle.quickDecodePreview.status === 'ready',
          tone: {
            userExposureEv: params.userExposureEv,
            userContrast: params.userContrast,
          },
          style: session.activeStyle,
        })
        const registry = resourceRegistryRef.current
        if (!registry) {
          throw Object.assign(new Error('EXPORT_RESOURCE_REGISTRY_MISSING'), {
            code: 'EXPORT_RESOURCE_REGISTRY_MISSING',
          })
        }

        const evacuation = await evacuateBeforeExport({
          registry,
          snapshot,
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
        })

        if (!isCurrentExport()) {
          return
        }

        emitExportDebugEvent({
          type: 'resource-evacuated',
          payload: {
            profile: jobExecutionPlan.profile.name,
            registryCheck: toDebugRegistryCheck(evacuation.registryCheck),
            evacuatedAt: evacuation.evacuatedAt,
          },
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
          session.sourceFile.name,
          session.activeStyle?.name ?? 'neutral',
        )

        const result = await runFullResolutionExportJob({
          file: loadedImage.file,
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
        const exportJobResult = result as {
          filename: string
          output?: typeof result.output
          blob?: Blob
        }
        const output =
          exportJobResult.output ??
          (exportJobResult.blob
            ? createBlobOutputResult({
                filename: exportJobResult.filename,
                blob: exportJobResult.blob,
              })
            : undefined)
        if (!output) {
          throw new Error('EXPORT_OUTPUT_MISSING')
        }

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

        const outputWithMetadata = withLazyJpegMetadata({
          output,
          metadata: loadedImage.metadata,
          width: completedCapability.width,
          height: completedCapability.height,
        })

        const exportResult = createExportResult({
          output: outputWithMetadata,
          filename: result.filename,
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
      params.userContrast,
      params.userExposureEv,
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

  const downloadExportResult = useCallback(async () => {
    const result = sessionRef.current?.exportState.result
    if (!result) return

    try {
      await downloadStoredExportResult(result)
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
        await copyExportResultToClipboard(result)
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
  }, [scheduleToast, stats?.previewSize])

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
    loadOnlineLUT,
    selectLUTProfile,
    selectBuiltinStyle,
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
