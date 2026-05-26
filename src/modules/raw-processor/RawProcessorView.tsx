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
import { useIosSafariToolbarNudge, useRawProcessor } from './hooks'
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
  useIosSafariToolbarNudge()

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
          canExport={canExport}
          disabledReason={exportDisabledReason}
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
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[oklch(0.04_0.012_76/0.58)] backdrop-blur-[2px]" />
              <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center p-5">
                <DialogPrimitive.Content
                  role="alertdialog"
                  className="pointer-events-auto w-full max-w-[20rem] overflow-hidden rounded-[16px] border border-[oklch(from_var(--color-lf-hero-ink)_l_c_h_/_0.2)] bg-[linear-gradient(180deg,var(--color-lf-dark-low),var(--color-lf-dark))] text-lf-hero-ink shadow-[0_32px_64px_oklch(0.04_0.012_76/0.65)]"
                >
                  <div className="px-6 pb-5 pt-6 text-center">
                    <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-[oklch(from_var(--color-lf-rose)_l_c_h_/_0.18)] text-lf-rose">
                      <RotateCcw aria-hidden="true" className="size-[22px]" />
                    </div>
                    <DialogTitle className="text-[1rem] font-semibold leading-tight text-lf-hero-ink">
                      {t('raw.resetConfirm.title')}
                    </DialogTitle>
                    <DialogDescription className="mt-2 text-[0.8rem] leading-6 text-lf-hero-ink/68">
                      {t('raw.resetConfirm.description')}
                    </DialogDescription>
                  </div>
                  <div className="grid grid-cols-2 border-t border-[oklch(from_var(--color-lf-hero-ink)_l_c_h_/_0.18)]">
                    <button
                      type="button"
                      onClick={() => setResetConfirmationOpen(false)}
                      className="min-h-12 border-0 border-e border-[oklch(from_var(--color-lf-hero-ink)_l_c_h_/_0.18)] bg-transparent px-3 text-[0.86rem] font-semibold text-lf-hero-ink transition-colors hover:bg-[oklch(from_var(--color-lf-hero-ink)_l_c_h_/_0.06)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-lf-green"
                    >
                      {t('raw.resetConfirm.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={confirmSessionReset}
                      className="min-h-12 border-0 bg-transparent px-3 text-[0.86rem] font-bold text-lf-rose transition-colors hover:bg-[oklch(from_var(--color-lf-hero-ink)_l_c_h_/_0.06)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-lf-rose"
                    >
                      {t('raw.resetConfirm.confirm')}
                    </button>
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
