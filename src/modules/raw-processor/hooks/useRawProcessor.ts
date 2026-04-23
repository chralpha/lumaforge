import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { ProcessingStatus } from '~/atoms/raw-processor'
import {
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
import type { DecodedImage } from '~/lib/raw/decoder'
import { isSupportedRaw } from '~/lib/raw/decoder'
import { rawRuntimeAdapter } from '~/lib/raw/runtime-adapter'

import {
  deriveCanEdit,
  deriveCanExport,
  selectDisplaySource,
} from '../model/derive-session'
import type { StyleAsset } from '../model/session'
import { BUILTIN_PRESETS } from '../services/builtin-presets'
import {
  buildExportFilename,
  recommendRetryLevel,
  runExportJob,
} from '../services/export-system'
import { runPreviewPipeline } from '../services/preview-pipeline'
import {
  buildBuiltinStyle,
  mapIntensityLevel,
  toCustomStyle,
} from '../services/style-system'
import { classifySupportLevel } from '../services/support-matrix'
import { useImageSession } from './useImageSession'

function toUserFacingErrorCode(code: unknown) {
  if (typeof code === 'string' && code.startsWith('LUT_')) return code
  if (typeof code === 'string' && code.startsWith('EXPORT_')) return code
  if (typeof code === 'string' && code.startsWith('RAW_')) return code
  return 'RAW_UNKNOWN'
}

function getStableErrorCode(error: unknown) {
  if (typeof error !== 'object' || !error || !('code' in error)) {
    return undefined
  }

  return (error as { code?: unknown }).code
}

function getProgressRecoveryHint(status: ProcessingStatus) {
  if (status === 'loading' || status === 'decoding') {
    return 'If HQ preview cannot finish, the first visible preview stays available and export remains disabled.'
  }

  if (status === 'processing') {
    return 'If the current render step fails, keep the session and retry the look without reloading the browser.'
  }

  if (status === 'exporting') {
    return 'If export fails, retry with a lower fidelity level from the current session.'
  }

  return undefined
}

function copyToArrayBuffer(data: Uint8Array) {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return buffer
}

const LARGE_RAW_SAFE_HQ_REUSE_BYTES = 32 * 1024 * 1024

export interface UseRawProcessorReturn {
  // State
  params: ProcessingParams
  loadedImage: { file: File | null; decoded: DecodedImage | null }
  status: ProcessingStatus
  error: string | null
  progress: number
  lut: ParsedLUT | null
  lutData: LUTData | null
  stats: PipelineStats | null
  hasImage: boolean
  canExport: boolean
  activeStyle: StyleAsset | null
  activePresetId: (typeof BUILTIN_PRESETS)[number]['id'] | null
  activeIntensity: 'off' | 'light' | 'standard' | 'strong'
  viewMode: ProcessingParams['viewMode']
  currentLutName: string | null
  sourceFileName: string
  supportLevel: 'official' | 'experimental'
  progressRecoveryHint?: string
  presetOptions: typeof BUILTIN_PRESETS
  embeddedPreviewUrl: string | null
  displaySource: 'embedded' | 'quick' | 'hq' | 'none'

  // Actions
  loadFile: (file: File) => Promise<void>
  loadLUT: (file: File) => Promise<void>
  selectBuiltinStyle: (id: (typeof BUILTIN_PRESETS)[number]['id']) => void
  selectIntensityLevel: (level: 'off' | 'light' | 'standard' | 'strong') => void
  setViewMode: (mode: ProcessingParams['viewMode']) => void
  clearLUT: () => void
  setParams: (params: Partial<ProcessingParams>) => void
  exportImage: (options: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
  }) => Promise<void>
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
  const { session, replaceFile, resetSession, setActiveStyle, setSession } =
    useImageSession()

  const pipelineRef = useRef<RawProcessingPipeline | null>(null)
  const sessionRef = useRef(session)
  const embeddedPreviewUrlRef = useRef<string | null>(null)
  const [lutData, setLutData] = useState<LUTData | null>(null)
  const hasImage = session ? deriveCanEdit(session) : false
  const canExport = session ? deriveCanExport(session) : false
  const activeStyle = session?.activeStyle || null
  const activePresetId =
    activeStyle?.kind === 'builtin'
      ? (BUILTIN_PRESETS.find((preset) => preset.name === activeStyle.name)
          ?.id ?? null)
      : null
  const activeIntensity = activeStyle?.currentIntensityLevel || 'standard'
  const viewMode = params.viewMode
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

  const revokeCurrentEmbeddedPreviewUrl = useCallback(() => {
    const urls = new Set(
      [
        embeddedPreviewUrlRef.current,
        sessionRef.current?.previewBundle.embeddedPreview.objectUrl,
      ].filter((url): url is string => Boolean(url)),
    )

    for (const url of urls) {
      URL.revokeObjectURL(url)
    }

    embeddedPreviewUrlRef.current = null
  }, [])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    return () => {
      revokeCurrentEmbeddedPreviewUrl()
    }
  }, [revokeCurrentEmbeddedPreviewUrl])

  // Convert LUT to pipeline format when it changes
  useEffect(() => {
    if (lut) {
      setLutData(toLUTData(lut))
    } else {
      setLutData(null)
    }
  }, [lut])

  // Load RAW file
  const loadFile = useCallback(
    async (file: File) => {
      if (!isSupportedRaw(file)) {
        setError(`Unsupported file format: ${file.name}`)
        return
      }

      try {
        revokeCurrentEmbeddedPreviewUrl()

        const nextSession = replaceFile(file)
        let quickPreview: DecodedImage | null = null
        let hqPreview: DecodedImage | null = null

        sessionRef.current = nextSession
        setLoadedImage({ file: null, decoded: null, metadata: null })
        setStatus('loading')
        setProgress(0)
        setError(null)
        setLut(null)
        setLutData(null)
        setParams((prev) => ({
          ...prev,
          intensity: 0.7,
          viewMode: 'processed',
          styleKind: 'none',
          builtinPreset: null,
        }))

        setSession((prev) => {
          if (!prev || prev.id !== nextSession.id) {
            return prev
          }

          return {
            ...prev,
            previewBundle: {
              ...prev.previewBundle,
              quickDecodePreview: { status: 'loading' },
              hqImage: { status: 'loading' },
            },
            renderState: {
              status: 'preparing',
            },
          }
        })

        const matchesActiveSession = () =>
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
          source: 'embedded' | 'quick' | 'hq',
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
              hqImage:
                source === 'hq'
                  ? {
                      status: 'ready' as const,
                      width: payload.width,
                      height: payload.height,
                      timings: payload.timings ?? decoded?.timings,
                    }
                  : prev.previewBundle.hqImage,
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
            setLoadedImage({
              file,
              decoded,
              metadata: decoded.metadata,
            })
            setStatus('ready')
          }
        }

        await runPreviewPipeline({
          file,
          extractEmbeddedPreview: rawRuntimeAdapter.extractEmbeddedPreview,
          decodeQuickPreview: async (targetFile) => {
            quickPreview = await rawRuntimeAdapter.decodeQuickRaw(
              targetFile,
              ({ phase, progress }) => {
                if (!matchesActiveSession()) {
                  return
                }

                setStatus(mapPhaseToStatus(phase))
                setProgress(progress * 0.5)
              },
            )

            return { width: quickPreview.width, height: quickPreview.height }
          },
          decodeHqPreview: async (targetFile) => {
            if (
              quickPreview &&
              targetFile.size >= LARGE_RAW_SAFE_HQ_REUSE_BYTES
            ) {
              hqPreview = quickPreview
              return { width: hqPreview.width, height: hqPreview.height }
            }

            hqPreview = await rawRuntimeAdapter.decodeHqRaw(
              targetFile,
              ({ phase, progress }) => {
                if (!matchesActiveSession()) {
                  return
                }

                setStatus(mapPhaseToStatus(phase))
                setProgress(50 + progress * 0.5)
              },
            )

            return { width: hqPreview.width, height: hqPreview.height }
          },
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
                break
              }
              case 'hq-ready': {
                updatePreviewState('hq', event, hqPreview)
                setProgress(100)
                if (hqPreview) {
                  toast.success(`Loaded ${file.name}`, {
                    description: `${hqPreview.width}×${hqPreview.height} • ${hqPreview.metadata.make || 'Unknown'} ${hqPreview.metadata.model || ''}`,
                  })
                }
                break
              }
              case 'hq-failed': {
                const errorCode = toUserFacingErrorCode(event.errorCode)

                setSession((prev) => {
                  if (!prev || prev.id !== nextSession.id) {
                    return prev
                  }

                  const previewBundle = {
                    ...prev.previewBundle,
                    hqImage: {
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
                      lastErrorCode: errorCode,
                    },
                  }
                })
                setStatus('ready')
                setProgress(100)
                toast.error('HQ preview unavailable', {
                  description:
                    'The first preview stays visible, but export remains disabled until HQ decode succeeds.',
                })
                break
              }
            }
          },
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load file'
        const errorCode = toUserFacingErrorCode(
          getStableErrorCode(err) ?? message,
        )
        setError(message)
        setSession((prev) =>
          prev
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
        toast.error('Failed to load RAW file', { description: message })
      }
    },
    [
      replaceFile,
      revokeCurrentEmbeddedPreviewUrl,
      setError,
      setLoadedImage,
      setLut,
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
        toast.error('Unsupported LUT format', {
          description: 'Only .cube files are supported',
        })
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
          toast.error('Failed to load LUT', {
            description: validation.errors[0] || 'Invalid LUT',
          })
          return
        }

        setLut(parsed)
        const style = toCustomStyle(parsed)
        setActiveStyle(style)
        setParams((prev) => ({
          ...prev,
          styleKind: 'custom',
          builtinPreset: null,
          intensity: mapIntensityLevel(style.defaultIntensityLevel),
        }))
        toast.success(`Loaded LUT: ${parsed.title}`, {
          description: `${parsed.size}³ grid`,
        })
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
        toast.error('Failed to load LUT', { description: message })
      }
    },
    [setActiveStyle, setLut, setParams, setSession],
  )

  const selectBuiltinStyle = useCallback(
    (id: (typeof BUILTIN_PRESETS)[number]['id']) => {
      const style = buildBuiltinStyle(id)
      setLut(null)
      setLutData(null)
      setActiveStyle(style)
      setParams((prev) => ({
        ...prev,
        styleKind: 'builtin',
        builtinPreset: id,
        intensity: mapIntensityLevel(style.defaultIntensityLevel),
      }))
    },
    [setActiveStyle, setLut, setParams],
  )

  const selectIntensityLevel = useCallback(
    (level: 'off' | 'light' | 'standard' | 'strong') => {
      setParams((prev) => ({ ...prev, intensity: mapIntensityLevel(level) }))
      setSession((prev) => {
        if (!prev || !prev.activeStyle) {
          return prev
        }

        return {
          ...prev,
          activeStyle: {
            ...prev.activeStyle,
            currentIntensityLevel: level,
          },
        }
      })
    },
    [setParams, setSession],
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

  // Clear LUT
  const clearLUT = useCallback(() => {
    setLut(null)
    setLutData(null)
    setActiveStyle(null)
    setParams((prev) => ({
      ...prev,
      styleKind: 'none',
      builtinPreset: null,
    }))
    toast.info('LUT cleared')
  }, [setActiveStyle, setLut, setParams])

  // Update params
  const handleSetParams = useCallback(
    (newParams: Partial<ProcessingParams>) => {
      setParams((prev) => ({ ...prev, ...newParams }))
    },
    [setParams],
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
      if (
        !session ||
        session.previewBundle.hqImage.status !== 'ready' ||
        !pipelineRef.current
      ) {
        toast.error('High-quality preview is required before export')
        return
      }

      try {
        setStatus('exporting')

        setSession((prev) =>
          prev
            ? {
                ...prev,
                exportState: {
                  ...prev.exportState,
                  status: 'exporting',
                  qualityPreset: quality,
                  fidelityLevel: fidelity,
                  retryRecommended: false,
                  recommendedRetryLevel: undefined,
                },
              }
            : prev,
        )

        const filename = buildExportFilename(
          session.sourceFile.name,
          session.activeStyle?.kind === 'custom'
            ? 'custom'
            : session.activeStyle?.name || 'original',
        )

        const result = await runExportJob({
          filename,
          quality: quality === 'high' ? 0.95 : 0.85,
          renderToCanvas: () =>
            pipelineRef.current!.renderToHiddenCanvas({
              width:
                session.sourceFile.width || loadedImage.decoded?.width || 0,
              height:
                session.sourceFile.height || loadedImage.decoded?.height || 0,
            }),
        })

        const url = URL.createObjectURL(result.blob)
        const link = document.createElement('a')
        link.href = url
        link.download = result.filename
        document.body.append(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)

        setSession((prev) =>
          prev
            ? {
                ...prev,
                exportState: {
                  ...prev.exportState,
                  status: 'done',
                  retryRecommended: false,
                  lastSuccessfulSize: {
                    width:
                      session.sourceFile.width ||
                      loadedImage.decoded?.width ||
                      0,
                    height:
                      session.sourceFile.height ||
                      loadedImage.decoded?.height ||
                      0,
                  },
                },
              }
            : prev,
        )
        setStatus('ready')
        toast.success('JPEG exported', {
          description: result.filename,
        })
      } catch (err) {
        const retryLevel = recommendRetryLevel(fidelity)
        const message = err instanceof Error ? err.message : 'Export failed'
        const errorCode = toUserFacingErrorCode(message)

        setSession((prev) =>
          prev
            ? {
                ...prev,
                exportState: {
                  ...prev.exportState,
                  status: 'failed',
                  lastErrorCode:
                    errorCode === 'RAW_UNKNOWN'
                      ? 'EXPORT_RENDER_FAILED'
                      : errorCode,
                  retryRecommended: retryLevel !== null,
                  recommendedRetryLevel: retryLevel ?? undefined,
                },
              }
            : prev,
        )
        setStatus('ready')
        toast.error('Export failed', {
          description: retryLevel
            ? `${message}. Retry with ${retryLevel} fidelity.`
            : message,
        })
      }
    },
    [loadedImage.decoded, session, setSession, setStatus],
  )

  // Reset state
  const reset = useCallback(() => {
    revokeCurrentEmbeddedPreviewUrl()
    setLoadedImage({ file: null, decoded: null, metadata: null })
    setStatus('idle')
    setError(null)
    setProgress(0)
    setStats(null)
    resetSession()
    sessionRef.current = null
  }, [
    resetSession,
    revokeCurrentEmbeddedPreviewUrl,
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

  return {
    params,
    loadedImage: {
      file: loadedImage.file,
      decoded: loadedImage.decoded,
    },
    status,
    error,
    progress,
    lut,
    lutData,
    stats,
    hasImage,
    canExport,
    activeStyle,
    activePresetId,
    activeIntensity,
    viewMode,
    currentLutName,
    sourceFileName,
    supportLevel,
    progressRecoveryHint,
    presetOptions: BUILTIN_PRESETS,
    embeddedPreviewUrl,
    displaySource,
    loadFile,
    loadLUT,
    selectBuiltinStyle,
    selectIntensityLevel,
    setViewMode,
    clearLUT,
    setParams: handleSetParams,
    exportImage,
    reset,
    dismissError,
    updateStats,
    pipelineRef,
  }
}
