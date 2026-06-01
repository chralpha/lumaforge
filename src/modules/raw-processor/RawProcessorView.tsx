/**
 * Main RAW Processor view component.
 * Combines all sub-components into a complete RAW editing interface.
 */

import './raw-lab.css'
import './raw-lab.surface.css'
import './raw-lab.effects.css'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useInRouterContext, useLocation } from 'react-router'

import { clsxm } from '~/lib/cn'
import type { PipelineStats, RawProcessingPipeline } from '~/lib/gl/pipeline'
import { useI18n } from '~/lib/i18n'
import { rawRuntimeAdapter } from '~/lib/raw/runtime-adapter'

import {
  ComparePreviewStage,
  ErrorOverlay,
  RAW_FILE_ACCEPT,
  RawToolSurface,
  UnsupportedState,
  WorkspaceHeader,
} from './components'
import { CpuPreviewBanner } from './components/CpuPreviewBanner'
import { CpuPreviewCanvas } from './components/CpuPreviewCanvas'
import type { RawRuntimeReadinessState } from './components/raw-runtime-readiness'
import { RawResetConfirmationDialog } from './components/RawResetConfirmationDialog'
import { useRawWorkflow } from './hooks'
import { useCapabilityGate } from './hooks/useCapabilityGate'
import type { CpuPreviewParams } from './hooks/useCpuPreview'
import { useCpuPreview } from './hooks/useCpuPreview'
import { useHiddenFilePicker } from './hooks/useHiddenFilePicker'
import { useOnlineLutSources } from './hooks/useOnlineLutSources'
import { clampCompareSplit } from './services/compare/compare-split'

export interface RawProcessorViewProps {
  className?: string
}

interface RawRouteLocation {
  search: string
  pathname: string
}

interface RawProcessorViewInnerProps extends RawProcessorViewProps {
  rawRouteLocation: RawRouteLocation
}

const fallbackRawRouteLocation: RawRouteLocation = {
  pathname: '/raw',
  search: '',
}

function RawProcessorViewWithRouterLocation(props: RawProcessorViewProps) {
  const location = useLocation()

  return (
    <RawProcessorViewInner
      {...props}
      rawRouteLocation={{
        pathname: location.pathname,
        search: location.search,
      }}
    />
  )
}

export function RawProcessorView(props: RawProcessorViewProps) {
  const inRouterContext = useInRouterContext()

  if (inRouterContext) {
    return <RawProcessorViewWithRouterLocation {...props} />
  }

  return (
    <RawProcessorViewInner
      {...props}
      rawRouteLocation={fallbackRawRouteLocation}
    />
  )
}

function RawProcessorViewInner({
  className,
  rawRouteLocation,
}: RawProcessorViewInnerProps) {
  const { t } = useI18n()
  const {
    params,
    loadedImage,
    status,
    error,
    progress,
    decodedImageRef,
    decodedImageVersion,
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
    currentLutName,
    sourceFileName,
    supportLevel,
    progressRecoveryHint,
    previewSuspended,
    viewMode,
    compareSplit,
    previewViewport,
    embeddedPreviewUrl,
    displaySource,
    originalReferenceSnapshot,
    originalReferenceFallbackReason,
    dualWebglAllowed,
    histogram,
    loadFile,
    loadLUT,
    loadOnlineLUT,
    selectLUTProfile,
    selectIntensityLevel,
    setToneParams,
    setColorParams,
    setViewMode,
    setCompareSplit,
    setPreviewViewport,
    setParams,
    clearLUT,
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
    resetTone,
    resetColor,
    dismissError,
    updateStats,
    pipelineRef,
  } = useRawWorkflow()
  const onlineLutSources = useOnlineLutSources({
    search: rawRouteLocation.search,
    pathname: rawRouteLocation.pathname,
    loadOnlineLUT,
  })
  const [runtimeReadinessState, setRuntimeReadinessState] =
    useState<RawRuntimeReadinessState>(() =>
      rawRuntimeAdapter.getPrewarmState(),
    )
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false)
  const [cpuPreviewBannerDismissed, setCpuPreviewBannerDismissed] =
    useState(false)
  const [cpuPreviewVariant, setCpuPreviewVariant] = useState<
    'processed' | 'neutral'
  >('processed')
  const runtimeReadinessMountedRef = useRef(false)

  useEffect(() => {
    runtimeReadinessMountedRef.current = true
    return () => {
      runtimeReadinessMountedRef.current = false
    }
  }, [])

  const syncRuntimeReadinessState = useCallback(() => {
    if (!runtimeReadinessMountedRef.current) return
    setRuntimeReadinessState(rawRuntimeAdapter.getPrewarmState())
  }, [])

  const triggerRawRuntimePrewarm = useCallback(() => {
    if (typeof window === 'undefined') return

    if (import.meta.env.MODE === 'test') {
      syncRuntimeReadinessState()
      return
    }

    const prewarm = rawRuntimeAdapter.prewarm()
    syncRuntimeReadinessState()
    void prewarm.then(syncRuntimeReadinessState, syncRuntimeReadinessState)
  }, [syncRuntimeReadinessState])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (import.meta.env.MODE === 'test') return
    let cancelled = false
    const trigger = () => {
      if (cancelled) return
      triggerRawRuntimePrewarm()
    }
    const win = window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout?: number },
      ) => number
      cancelIdleCallback?: (handle: number) => void
    }
    if (typeof win.requestIdleCallback === 'function') {
      const handle = win.requestIdleCallback(trigger, { timeout: 1500 })
      return () => {
        cancelled = true
        win.cancelIdleCallback?.(handle)
      }
    }
    const handle = window.setTimeout(trigger, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [triggerRawRuntimePrewarm])

  // Handle file drop
  const handleFileDrop = useCallback(
    (files: File[]) => {
      if (files.length > 0) {
        loadFile(files[0])
      }
    },
    [loadFile],
  )

  // Handle LUT drop
  const handleLutDrop = useCallback(
    (files: File[]) => {
      if (files.length > 0) {
        loadLUT(files[0])
      }
    },
    [loadLUT],
  )

  // Handle export
  const handleExport = useCallback(
    (options: {
      quality: 'standard' | 'high'
      fidelity: 'safe' | 'balanced' | 'max'
    }) => {
      exportImage(options)
    },
    [exportImage],
  )

  const replacePicker = useHiddenFilePicker({
    accept: RAW_FILE_ACCEPT.join(','),
    onFile: (file) => {
      void loadFile(file)
    },
  })

  const recoveryPicker = useHiddenFilePicker({
    accept: RAW_FILE_ACCEPT.join(','),
    onFile: (file) => {
      void recoverInterruptedExport(file)
    },
  })

  const handleReplaceFile = useCallback(() => {
    replacePicker.open()
  }, [replacePicker])

  const handleRecoveryFileSelect = useCallback(() => {
    recoveryPicker.open()
  }, [recoveryPicker])

  // Handle stats update from canvas
  const handleStatsUpdate = useCallback(
    (newStats: PipelineStats) => {
      updateStats(newStats)
    },
    [updateStats],
  )

  const handlePipelineChange = useCallback(
    (pipeline: RawProcessingPipeline | null) => {
      pipelineRef.current = pipeline
    },
    [pipelineRef],
  )

  const handleCompareReset = useCallback(() => {
    setViewMode('compare')
    setCompareSplit(0.5)
  }, [setCompareSplit, setViewMode])

  const requestSessionReset = useCallback(() => {
    setResetConfirmationOpen(true)
  }, [])

  const confirmSessionReset = useCallback(() => {
    setResetConfirmationOpen(false)
    reset()
  }, [reset])

  useEffect(() => {
    if (!hasImage) setResetConfirmationOpen(false)
  }, [hasImage])

  // The interactive preview frame is owned by `PreviewCanvas`, but mobile
  // chrome needs to attach gesture listeners (long-press peek / tap) to the
  // same DOM element so they coexist with pinch / pan instead of a sibling
  // overlay swallowing every touch.
  const [previewFrameEl, setPreviewFrameEl] = useState<HTMLDivElement | null>(
    null,
  )

  const handleCompareSplitPreviewChange = useCallback(
    (split: number) => {
      setParams({ compareSplit: clampCompareSplit(split) })
    },
    [setParams],
  )

  const isProcessing =
    status === 'warming' ||
    status === 'loading' ||
    status === 'decoding' ||
    status === 'processing' ||
    status === 'exporting'
  const toolMetadata = loadedImage.metadata
  const decodedPreviewSize = decodedImageRef.current
    ? {
        width: decodedImageRef.current.width,
        height: decodedImageRef.current.height,
      }
    : null

  const toolStats = stats
    ? {
        processTime: stats.processTime,
        inputSize: stats.inputSize,
        previewSize: decodedPreviewSize ?? stats.previewSize,
      }
    : null
  const capability = useCapabilityGate()
  const isCpuMode = capability.ready && capability.previewMode === 'cpu'

  // Build CPU preview params from the same sources as ComparePreviewStage/
  // PreviewCanvas (decodedImageRef + processing params + lut).
  const cpuPreviewParams: CpuPreviewParams = {
    styleKind: params.styleKind,
    intensity: params.intensity,
    builtinPreset: params.builtinPreset,
    lut: lutDataRef.current,
    rawRenderExposure: decodedImageRef.current?.renderExposure ?? {
      ev: 0,
      multiplier: 1,
      source: 'identity',
    },
    userExposureEv: params.userExposureEv,
    userContrast: params.userContrast,
    userHighlights: params.userHighlights,
    userShadows: params.userShadows,
    userWhites: params.userWhites,
    userBlacks: params.userBlacks,
    userTemperature: params.userTemperature,
    userTint: params.userTint,
  }

  // useCpuPreview must be called unconditionally (Rules of Hooks).
  // It self-gates via the `enabled` flag.
  const cpuPreview = useCpuPreview({
    enabled: isCpuMode && hasImage,
    image: decodedImageRef.current,
    imageVersion: decodedImageVersion,
    params: cpuPreviewParams,
    variant: cpuPreviewVariant,
  })

  // Map the structured `reason` token from RawPreviewCapability to a
  // localized string before passing to UnsupportedState.
  const unsupportedReason =
    capability.ready && capability.supportStatus === 'unsupported'
      ? capability.reason === 'coi-missing'
        ? t('raw.unsupported.coi')
        : t('raw.unsupported.webgl2')
      : t('raw.unsupported.webgl2')

  if (capability.ready && capability.supportStatus === 'unsupported') {
    return (
      <div
        className={clsxm('raw-lab', className)}
        data-raw-lab-shell="viewport"
        data-raw-lab-state="unsupported"
      >
        <UnsupportedState reason={unsupportedReason} />
      </div>
    )
  }

  return (
    <div
      className={clsxm('raw-lab', className)}
      data-raw-lab-shell="viewport"
      data-raw-lab-state={hasImage ? 'loaded' : 'empty'}
    >
      <div className="max-[640px]:hidden">
        <WorkspaceHeader
          fileName={sourceFileName}
          hasImage={hasImage}
          supportLevel={supportLevel}
          onReplaceFile={handleReplaceFile}
          onResetSession={requestSessionReset}
        />
      </div>

      {isCpuMode && !cpuPreviewBannerDismissed && (
        <CpuPreviewBanner
          reason={
            capability.supportStatus === 'degraded'
              ? capability.reason
              : 'webgl2-missing'
          }
          onDismiss={() => setCpuPreviewBannerDismissed(true)}
          className="mx-3 mt-2 max-[640px]:mx-2"
        />
      )}

      <div
        className="raw-lab-shell grid min-h-0 min-w-0 overflow-hidden [grid-template-columns:minmax(0,1fr)_minmax(332px,376px)] max-[980px]:[grid-template-columns:minmax(0,1fr)] max-[980px]:[grid-template-rows:minmax(0,1fr)_auto] max-[640px]:[grid-template-columns:minmax(0,1fr)] max-[640px]:[grid-template-rows:minmax(0,1fr)]"
        data-raw-lab-layout="stage-tools"
        data-raw-desktop-layout="photo-stage-command-rail"
      >
        {isCpuMode && hasImage ? (
          <section
            className="raw-lab-stage relative flex flex-col"
            aria-label={t('raw.stage.aria')}
          >
            <CpuPreviewCanvas
              frame={cpuPreview.frame}
              inFlight={cpuPreview.inFlight}
              failureReason={cpuPreview.failureReason}
              fallbackThumbnailUrl={embeddedPreviewUrl}
              className="min-h-0 flex-1"
            />
            {hasImage && (
              <div className="flex shrink-0 justify-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setCpuPreviewVariant('processed')}
                  className={clsxm(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    cpuPreviewVariant === 'processed'
                      ? 'border-lf-green/60 bg-lf-green/10 text-lf-on-photo-ink'
                      : 'border-lf-on-photo-bord-soft bg-lf-on-photo-bg-strong text-lf-on-photo-ink/60 hover:text-lf-on-photo-ink',
                  )}
                >
                  {t('raw.preview.cpuDegraded.showProcessed')}
                </button>
                <button
                  type="button"
                  onClick={() => setCpuPreviewVariant('neutral')}
                  className={clsxm(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    cpuPreviewVariant === 'neutral'
                      ? 'border-lf-green/60 bg-lf-green/10 text-lf-on-photo-ink'
                      : 'border-lf-on-photo-bord-soft bg-lf-on-photo-bg-strong text-lf-on-photo-ink/60 hover:text-lf-on-photo-ink',
                  )}
                >
                  {t('raw.preview.cpuDegraded.showOriginal')}
                </button>
              </div>
            )}
          </section>
        ) : (
          <ComparePreviewStage
            hasImage={hasImage}
            imageRef={decodedImageRef}
            imageVersion={decodedImageVersion}
            params={params}
            lutDataRef={lutDataRef}
            lutDataVersion={lutDataVersion}
            embeddedPreviewUrl={embeddedPreviewUrl}
            displaySource={displaySource}
            originalReferenceSnapshot={originalReferenceSnapshot}
            originalReferenceFallbackReason={originalReferenceFallbackReason}
            dualWebglAllowed={dualWebglAllowed}
            previewSuspended={previewSuspended}
            previewViewport={previewViewport}
            split={compareSplit}
            splitEnabled={viewMode === 'compare'}
            onSplitChange={setCompareSplit}
            onSplitPreviewChange={handleCompareSplitPreviewChange}
            onPreviewViewportChange={setPreviewViewport}
            isProcessing={isProcessing}
            runtimeReadinessState={runtimeReadinessState}
            onPrepareRuntime={triggerRawRuntimePrewarm}
            phase={
              status === 'warming'
                ? 'warming'
                : status === 'loading'
                  ? 'loading'
                  : status === 'decoding'
                    ? 'decoding'
                    : status === 'exporting'
                      ? 'exporting'
                      : 'processing'
            }
            progress={progress}
            recoveryHint={progressRecoveryHint}
            onRawDrop={handleFileDrop}
            onStatsUpdate={handleStatsUpdate}
            onPipelineChange={handlePipelineChange}
            onOriginalPreviewPipelineChange={setOriginalPreviewPipeline}
            onRequestOriginalReferenceFallback={
              requestOriginalReferenceFallback
            }
            onRestorePreview={restorePreviewAfterExport}
            previewFrameRef={setPreviewFrameEl}
          />
        )}

        <RawToolSurface
          activeIntensity={activeIntensity}
          tone={{
            userExposureEv: params.userExposureEv,
            userContrast: params.userContrast,
            userHighlights: params.userHighlights,
            userShadows: params.userShadows,
            userWhites: params.userWhites,
            userBlacks: params.userBlacks,
          }}
          color={{
            userTemperature: params.userTemperature,
            userTint: params.userTint,
          }}
          onIntensitySelect={selectIntensityLevel}
          onToneChange={setToneParams}
          onToneReset={resetTone}
          onColorChange={setColorParams}
          onColorReset={resetColor}
          fileName={sourceFileName}
          onReplaceFile={handleReplaceFile}
          onResetSession={requestSessionReset}
          onCompareReset={handleCompareReset}
          viewMode={isCpuMode ? 'processed' : viewMode}
          onViewModeChange={isCpuMode ? () => {} : setViewMode}
          compareSplit={compareSplit}
          onCompareSplitChange={isCpuMode ? () => {} : setCompareSplit}
          onLutLoad={handleLutDrop}
          onLutClear={clearLUT}
          currentLutName={currentLutName}
          lutProfileSelection={lutProfileSelection}
          lutProfileResolution={
            activeStyle?.kind === 'custom'
              ? activeStyle.lutAsset?.profileResolution
              : null
          }
          onLutProfileSelect={selectLUTProfile}
          onlineLutSources={onlineLutSources}
          onExport={handleExport}
          onPreviewExport={exportPreviewImage}
          canExport={canExport}
          disabledReason={exportDisabledReason}
          canPreviewExport={canPreviewExport}
          previewExportDisabledReason={previewExportDisabledReason}
          isProcessing={isProcessing}
          isExporting={status === 'exporting'}
          runtimeReadinessState={runtimeReadinessState}
          onPrepareRuntime={triggerRawRuntimePrewarm}
          previewSuspended={previewSuspended}
          exportResult={exportResult}
          exportShareCapability={exportShareCapability}
          recovery={exportRecovery}
          onShareExport={shareExportResult}
          onDownloadExport={downloadExportResult}
          onCopyExport={copyExportResult}
          onRecoverExportSource={handleRecoveryFileSelect}
          hasImage={hasImage}
          supportLevel={supportLevel}
          metadata={toolMetadata}
          stats={toolStats}
          histogram={
            isCpuMode
              ? {
                  state: 'unsupported',
                  reason: t('raw.preview.cpuDegraded.banner'),
                }
              : histogram
          }
          previewFrameEl={previewFrameEl}
        />
      </div>

      <ErrorOverlay
        visible={status === 'error' && !!error}
        message={error || ''}
        onDismiss={dismissError}
      />

      <RawResetConfirmationDialog
        open={resetConfirmationOpen}
        onOpenChange={setResetConfirmationOpen}
        onConfirm={confirmSessionReset}
      />

      <input {...replacePicker.inputProps} />
      <input {...recoveryPicker.inputProps} />
    </div>
  )
}

export default RawProcessorView
