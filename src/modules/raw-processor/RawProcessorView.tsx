/**
 * Main RAW Processor view component.
 * Combines all sub-components into a complete RAW editing interface.
 */

import './raw-lab.css'

import { useCallback } from 'react'

import { clsxm } from '~/lib/cn'
import type { PipelineStats, RawProcessingPipeline } from '~/lib/gl/pipeline'

import {
  ComparePreviewStage,
  ControlsPanel,
  ErrorOverlay,
  MetadataPanel,
  StatsPanel,
  UnsupportedState,
  WorkspaceHeader,
} from './components'
import { useRawProcessor } from './hooks'
import { useCapabilityGate } from './hooks/useCapabilityGate'

export interface RawProcessorViewProps {
  className?: string
}

export function RawProcessorView({ className }: RawProcessorViewProps) {
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
    activeStyle,
    lutProfileSelection,
    activePresetId,
    activeIntensity,
    viewMode,
    currentLutName,
    sourceFileName,
    supportLevel,
    progressRecoveryHint,
    compareSplit,
    presetOptions,
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
    exportImage,
    reset,
    dismissError,
    updateStats,
    pipelineRef,
  } = useRawProcessor()

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

  const handleReplaceFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept =
      '.cr2,.cr3,.nef,.arw,.raf,.rw2,.orf,.dng,.pef,.srw,.3fr,.fff,.iiq,.raw'
    input.onchange = () => {
      const nextFile = input.files?.[0]
      if (nextFile) {
        loadFile(nextFile)
      }
    }
    input.click()
  }, [loadFile])

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

  const handleCompareSplitPreviewChange = useCallback(
    (split: number) => {
      const pipeline = pipelineRef.current
      if (!pipeline) return

      pipeline.setParams({ compareSplit: split })
      pipeline.render({ waitForGpu: false })
    },
    [pipelineRef],
  )

  const isProcessing =
    status === 'loading' ||
    status === 'decoding' ||
    status === 'processing' ||
    status === 'exporting'
  const capability = useCapabilityGate()

  if (capability.ready && capability.supportStatus === 'unsupported') {
    return (
      <UnsupportedState reason={capability.reason || 'WebGL2 is required'} />
    )
  }

  return (
    <div className={clsxm('raw-lab', className)}>
      <WorkspaceHeader
        fileName={sourceFileName}
        hasImage={hasImage}
        supportLevel={supportLevel}
        canExport={canExport}
        disabledReason={exportDisabledReason}
        onReplaceFile={handleReplaceFile}
        onResetSession={reset}
        onOpenExport={() =>
          handleExport({ quality: 'high', fidelity: 'balanced' })
        }
      />

      <div className="raw-lab-shell">
        <ComparePreviewStage
          hasImage={hasImage}
          imageRef={decodedImageRef}
          imageVersion={decodedImageVersion}
          params={params}
          lutDataRef={lutDataRef}
          lutDataVersion={lutDataVersion}
          embeddedPreviewUrl={embeddedPreviewUrl}
          displaySource={displaySource}
          split={compareSplit}
          onSplitChange={setCompareSplit}
          onSplitPreviewChange={handleCompareSplitPreviewChange}
          isProcessing={isProcessing}
          phase={
            status === 'loading'
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
        />

        <aside className="raw-lab-controls" aria-label="RAW finishing controls">
          <ControlsPanel
            presetOptions={presetOptions.map(({ id, name }) => ({ id, name }))}
            activePresetId={activePresetId}
            activeIntensity={activeIntensity}
            viewMode={viewMode}
            onPresetSelect={(id) =>
              selectBuiltinStyle(id as (typeof presetOptions)[number]['id'])
            }
            onIntensitySelect={selectIntensityLevel}
            onCompareReset={handleCompareReset}
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
            onExport={handleExport}
            canExport={canExport}
            disabledReason={exportDisabledReason}
            isProcessing={isProcessing}
            hasImage={hasImage}
          />
          {loadedImage.metadata && (
            <MetadataPanel
              metadata={{
                ...loadedImage.metadata,
                width:
                  decodedImageRef.current?.width ?? loadedImage.metadata.width,
                height:
                  decodedImageRef.current?.height ??
                  loadedImage.metadata.height,
              }}
            />
          )}
          {stats && <StatsPanel stats={stats} />}
        </aside>
      </div>

      <ErrorOverlay
        visible={status === 'error' && !!error}
        message={error || ''}
        onDismiss={dismissError}
      />
    </div>
  )
}

export default RawProcessorView
