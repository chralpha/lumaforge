/**
 * Main RAW Processor view component.
 * Combines all sub-components into a complete RAW editing interface.
 */

import './raw-lab.css'
import './raw-lab.surface.css'
import './raw-lab.effects.css'

import { useCallback, useEffect, useState } from 'react'
import { useInRouterContext, useLocation } from 'react-router'

import { clsxm } from '~/lib/cn'
import type { PipelineStats, RawProcessingPipeline } from '~/lib/gl/pipeline'
import { useI18n } from '~/lib/i18n'

import {
  ErrorOverlay,
  RAW_FILE_ACCEPT,
  RawToolSurface,
  UnsupportedState,
  WorkspaceHeader,
} from './components'
import { CpuPreviewBanner } from './components/CpuPreviewBanner'
import { RawPreviewStageSurface } from './components/RawPreviewStageSurface'
import { RawResetConfirmationDialog } from './components/RawResetConfirmationDialog'
import { RawWorkflowToolProvider } from './components/RawWorkflowToolProvider'
import { useRawWorkflow } from './hooks'
import { useRawRuntimeReadiness } from './hooks/stages/ingest/useRawRuntimeReadiness'
import { useCapabilityGate } from './hooks/useCapabilityGate'
import { useHiddenFilePicker } from './hooks/useHiddenFilePicker'
import { useOnlineLutSources } from './hooks/useOnlineLutSources'

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
  const workflow = useRawWorkflow()
  const {
    status,
    error,
    hasImage,
    sourceFileName,
    supportLevel,
    loadFile,
    loadLUT,
    loadOnlineLUT,
    setViewMode,
    setCompareSplit,
    exportImage,
    recoverInterruptedExport,
    reset,
    dismissError,
    updateStats,
    pipelineRef,
  } = workflow
  const onlineLutSources = useOnlineLutSources({
    search: rawRouteLocation.search,
    pathname: rawRouteLocation.pathname,
    loadOnlineLUT,
  })
  const { runtimeReadinessState, triggerRawRuntimePrewarm } =
    useRawRuntimeReadiness()
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false)
  const [cpuPreviewBannerDismissed, setCpuPreviewBannerDismissed] =
    useState(false)

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

  const isProcessing =
    status === 'warming' ||
    status === 'loading' ||
    status === 'decoding' ||
    status === 'processing' ||
    status === 'exporting'
  const capability = useCapabilityGate()
  const isCpuMode = capability.ready && capability.previewMode === 'cpu'

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
        <RawPreviewStageSurface
          workflow={workflow}
          isCpuMode={isCpuMode}
          isProcessing={isProcessing}
          runtimeReadinessState={runtimeReadinessState}
          onPrepareRuntime={triggerRawRuntimePrewarm}
          onRawDrop={handleFileDrop}
          onStatsUpdate={handleStatsUpdate}
          onPipelineChange={handlePipelineChange}
          onPreviewFrameChange={setPreviewFrameEl}
        />

        <RawWorkflowToolProvider
          workflow={workflow}
          onlineLutSources={onlineLutSources}
          isCpuMode={isCpuMode}
          isProcessing={isProcessing}
          runtimeReadinessState={runtimeReadinessState}
          previewFrameEl={previewFrameEl}
          onReplaceFile={handleReplaceFile}
          onResetSession={requestSessionReset}
          onCompareReset={handleCompareReset}
          onLutDrop={handleLutDrop}
          onExport={handleExport}
          onRecoverExportSource={handleRecoveryFileSelect}
          onPrepareRuntime={triggerRawRuntimePrewarm}
        >
          <RawToolSurface />
        </RawWorkflowToolProvider>
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
