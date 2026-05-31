/**
 * Main RAW Processor view component.
 * Combines all sub-components into a complete RAW editing interface.
 */

import './raw-lab.css'
import './raw-lab.surface.css'
import './raw-lab.effects.css'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useInRouterContext, useLocation } from 'react-router'

import { Button } from '~/components/ui/button'
import { Dialog, DialogDescription, DialogTitle } from '~/components/ui/dialog'
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
import { useRawProcessor } from './hooks'
import { useCapabilityGate } from './hooks/useCapabilityGate'
import type { CpuPreviewParams } from './hooks/useCpuPreview'
import { useCpuPreview } from './hooks/useCpuPreview'
import { useHiddenFilePicker } from './hooks/useHiddenFilePicker'
import { useOnlineLutSources } from './hooks/useOnlineLutSources'
import { clampCompareSplit } from './services/compare-split'

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
    dismissError,
    updateStats,
    pipelineRef,
  } = useRawProcessor()
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
          onIntensitySelect={selectIntensityLevel}
          onToneChange={setToneParams}
          onToneReset={resetTone}
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

      <Dialog
        modal
        open={resetConfirmationOpen}
        onOpenChange={setResetConfirmationOpen}
      >
        <DialogPrimitive.Portal forceMount>
          {resetConfirmationOpen && (
            <>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/52 backdrop-blur-[2px] sm:bg-black/55" />
              <div className="pointer-events-none fixed inset-0 z-[60] grid items-end p-0 sm:place-items-center sm:p-5">
                <DialogPrimitive.Content
                  role="alertdialog"
                  data-mobile-substrate="ink-sheet"
                  className="pointer-events-auto grid max-h-[82%] w-full overflow-hidden rounded-t-xl border-t border-lf-on-photo-bord-soft bg-gradient-to-t from-black/92 via-black/82 to-lf-darkroom-stage-low/94 text-lf-on-photo-ink shadow-[0_-18px_42px_oklch(0.04_0.012_76/0.62)] backdrop-blur-background sm:max-w-[28rem] sm:rounded-lf-panel sm:border sm:border-lf-on-photo-bord-soft sm:bg-[oklch(0.092_0.006_255/0.96)] sm:bg-none sm:text-lf-on-photo-ink sm:shadow-[0_22px_64px_oklch(0.04_0.006_255/0.5),inset_0_1px_0_oklch(0.96_0.006_255/0.06)]"
                >
                  <div className="px-5 pb-5 pt-5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="grid size-8 shrink-0 place-items-center rounded-lf-control border border-lf-rose/40 bg-lf-on-photo-bg-strong text-lf-rose sm:border-lf-rose/30 sm:bg-[oklch(0.96_0.006_255/0.05)]">
                        <RotateCcw aria-hidden="true" className="size-[12px]" />
                      </div>
                      <DialogTitle className="flex h-8 min-w-0 items-center text-[1rem] font-semibold leading-none text-lf-on-photo-ink">
                        {t('raw.resetConfirm.title')}
                      </DialogTitle>
                    </div>
                    <DialogDescription className="mt-3 text-lf-body leading-6 text-lf-on-photo-ink/72">
                      {t('raw.resetConfirm.description')}
                    </DialogDescription>
                  </div>
                  <div
                    className="grid grid-cols-2 gap-2 border-t border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-4 py-3 sm:flex sm:justify-end sm:border-lf-on-photo-bord-soft sm:bg-[oklch(0.062_0.006_255/0.92)] sm:px-5 sm:shadow-[inset_0_1px_0_oklch(0.96_0.006_255/0.06)]"
                    data-raw-reset-confirm-actions
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      onClick={() => setResetConfirmationOpen(false)}
                      className="min-h-[44px] border-lf-on-photo-bord-soft bg-lf-on-photo-bg-strong text-lf-on-photo-ink/82 shadow-none hover:bg-lf-on-photo-bg-strong hover:text-lf-on-photo-ink sm:min-h-0 sm:border-0 sm:bg-transparent sm:text-lf-on-photo-ink/78 sm:shadow-none sm:hover:bg-[oklch(0.96_0.006_255/0.06)] sm:hover:text-lf-on-photo-ink"
                    >
                      {t('raw.resetConfirm.cancel')}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      type="button"
                      onClick={confirmSessionReset}
                      className="min-h-[44px] text-lf-on-photo-ink sm:min-h-0"
                    >
                      {t('raw.resetConfirm.confirm')}
                    </Button>
                  </div>
                </DialogPrimitive.Content>
              </div>
            </>
          )}
        </DialogPrimitive.Portal>
      </Dialog>

      <input {...replacePicker.inputProps} />
      <input {...recoveryPicker.inputProps} />
    </div>
  )
}

export default RawProcessorView
