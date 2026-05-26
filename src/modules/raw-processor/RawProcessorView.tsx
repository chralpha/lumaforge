/**
 * Main RAW Processor view component.
 * Combines all sub-components into a complete RAW editing interface.
 */

import './raw-lab.css'
import './raw-lab.surface.css'

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
import type { RawRuntimeReadinessState } from './components/raw-runtime-readiness'
import { useRawProcessor } from './hooks'
import { useCapabilityGate } from './hooks/useCapabilityGate'
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

  if (capability.ready && capability.supportStatus === 'unsupported') {
    return (
      <div
        className={clsxm('raw-lab', className)}
        data-raw-lab-shell="viewport"
        data-raw-lab-state="unsupported"
      >
        <UnsupportedState
          reason={capability.reason || t('raw.unsupported.webgl2')}
        />
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

      <div
        className="raw-lab-shell grid min-h-0 min-w-0 overflow-hidden [grid-template-columns:minmax(0,1fr)_minmax(340px,400px)] max-[980px]:[grid-template-columns:minmax(0,1fr)] max-[980px]:[grid-template-rows:minmax(0,1fr)_auto] max-[640px]:[grid-template-columns:minmax(0,1fr)] max-[640px]:[grid-template-rows:minmax(0,1fr)]"
        data-raw-lab-layout="stage-tools"
      >
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
          onRequestOriginalReferenceFallback={requestOriginalReferenceFallback}
          onRestorePreview={restorePreviewAfterExport}
          previewFrameRef={setPreviewFrameEl}
        />

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
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          compareSplit={compareSplit}
          onCompareSplitChange={setCompareSplit}
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
          histogram={histogram}
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
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/52 backdrop-blur-[2px] sm:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.24)] sm:backdrop-blur-[1px]" />
              <div className="pointer-events-none fixed inset-0 z-[60] grid items-end p-0 sm:place-items-center sm:p-5">
                <DialogPrimitive.Content
                  role="alertdialog"
                  data-mobile-substrate="ink-sheet"
                  className="pointer-events-auto grid max-h-[82%] w-full overflow-hidden rounded-t-xl border-t border-lf-on-photo-bord-soft bg-gradient-to-t from-black/92 via-black/82 to-lf-dark-low/94 text-lf-hero-ink shadow-[0_-18px_42px_oklch(0.04_0.012_76/0.62)] backdrop-blur-background sm:max-w-[28rem] sm:rounded-lf-panel sm:border sm:border-border-secondary sm:bg-lf-paper-high sm:bg-none sm:text-lf-ink sm:shadow-lf-popover sm:backdrop-blur-none"
                >
                  <div className="px-5 pb-5 pt-5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="grid size-8 shrink-0 place-items-center rounded-lf-control border border-lf-rose/40 bg-lf-on-photo-bg-strong text-lf-rose sm:border-lf-rose/30 sm:bg-lf-paper-warm">
                        <RotateCcw aria-hidden="true" className="size-[12px]" />
                      </div>
                      <DialogTitle className="flex h-8 min-w-0 items-center text-[1rem] font-semibold leading-none text-lf-hero-ink sm:text-lf-ink">
                        {t('raw.resetConfirm.title')}
                      </DialogTitle>
                    </div>
                    <DialogDescription className="mt-3 text-lf-body leading-6 text-lf-hero-ink/72 sm:text-lf-ink-soft">
                      {t('raw.resetConfirm.description')}
                    </DialogDescription>
                  </div>
                  <div
                    className="grid grid-cols-2 gap-2 border-t border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-4 py-3 sm:flex sm:justify-end sm:border-border-secondary sm:bg-lf-paper-warm/60 sm:px-5"
                    data-raw-reset-confirm-actions
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      onClick={() => setResetConfirmationOpen(false)}
                      className="min-h-[44px] border-lf-on-photo-bord-soft bg-lf-on-photo-bg-strong text-lf-hero-ink/82 shadow-none hover:bg-lf-on-photo-bg-strong hover:text-lf-hero-ink sm:min-h-0 sm:border-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.08)] sm:bg-lf-paper-high sm:text-lf-ink/85 sm:shadow-lf-soft sm:hover:bg-lf-paper-low sm:hover:text-lf-ink"
                    >
                      {t('raw.resetConfirm.cancel')}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      type="button"
                      onClick={confirmSessionReset}
                      className="min-h-[44px] sm:min-h-0"
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
