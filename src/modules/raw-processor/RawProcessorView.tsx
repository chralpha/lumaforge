/**
 * Main RAW Processor view component.
 * Combines all sub-components into a complete RAW editing interface.
 */

import { m } from 'motion/react'
import { useCallback } from 'react'

import { clsxm } from '~/lib/cn'
import type { PipelineStats, RawProcessingPipeline } from '~/lib/gl/pipeline'
import { Spring } from '~/lib/spring'

import {
  ControlsPanel,
  ErrorOverlay,
  MetadataPanel,
  PreviewCanvas,
  ProgressOverlay,
  StatsPanel,
  UnsupportedState,
  UploadState,
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
    lutData,
    stats,
    hasImage,
    canExport,
    activePresetId,
    activeIntensity,
    viewMode,
    currentLutName,
    sourceFileName,
    supportLevel,
    progressRecoveryHint,
    presetOptions,
    embeddedPreviewUrl,
    displaySource,
    loadFile,
    loadLUT,
    selectBuiltinStyle,
    selectIntensityLevel,
    setViewMode,
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

  const isProcessing =
    status === 'loading' ||
    status === 'decoding' ||
    status === 'processing' ||
    status === 'exporting'
  const shouldShowProgressOverlay =
    isProcessing && (displaySource === 'none' || status === 'exporting')
  const capability = useCapabilityGate()

  if (capability.ready && capability.supportStatus === 'unsupported') {
    return (
      <UnsupportedState reason={capability.reason || 'WebGL2 is required'} />
    )
  }

  return (
    <div className={clsxm('relative flex flex-col h-full', className)}>
      {hasImage && (
        <WorkspaceHeader
          fileName={sourceFileName}
          supportLevel={supportLevel}
          canExport={canExport}
          onReplaceFile={handleReplaceFile}
          onResetSession={reset}
          onOpenExport={() =>
            handleExport({ quality: 'high', fidelity: 'balanced' })
          }
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {!hasImage ? (
          <m.div
            className="flex-1 flex items-center justify-center p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={Spring.presets.smooth}
          >
            <UploadState onFileDrop={handleFileDrop} disabled={isProcessing} />
          </m.div>
        ) : (
          // Loaded state - preview and controls
          <>
            {/* Preview area */}
            <m.div
              className="flex-1 flex flex-col min-w-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={Spring.presets.smooth}
            >
              {/* Canvas */}
              <div className="flex-1 relative">
                <PreviewCanvas
                  imageData={loadedImage.decoded?.data || null}
                  imageLayout={loadedImage.decoded?.layout || null}
                  imageColorSpace={loadedImage.decoded?.colorSpace || null}
                  imageWidth={loadedImage.decoded?.width || 0}
                  imageHeight={loadedImage.decoded?.height || 0}
                  params={params}
                  lutData={lutData}
                  embeddedPreviewUrl={embeddedPreviewUrl}
                  displaySource={displaySource}
                  onStatsUpdate={handleStatsUpdate}
                  onPipelineChange={handlePipelineChange}
                />

                {/* Processing overlay */}
                <ProgressOverlay
                  visible={shouldShowProgressOverlay}
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
                />
              </div>

              {/* Bottom bar with metadata and stats */}
              <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-4">
                {loadedImage.decoded?.metadata && (
                  <MetadataPanel
                    metadata={{
                      ...loadedImage.decoded.metadata,
                      width: loadedImage.decoded.width,
                      height: loadedImage.decoded.height,
                    }}
                  />
                )}
                {stats && <StatsPanel stats={stats} />}
              </div>
            </m.div>

            {/* Controls sidebar */}
            <m.aside
              className="w-80 border-l border-border overflow-y-auto p-4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={Spring.presets.smooth}
            >
              <ControlsPanel
                presetOptions={presetOptions.map(({ id, name }) => ({
                  id,
                  name,
                }))}
                activePresetId={activePresetId}
                activeIntensity={activeIntensity}
                viewMode={viewMode}
                onPresetSelect={(id) =>
                  selectBuiltinStyle(id as (typeof presetOptions)[number]['id'])
                }
                onIntensitySelect={selectIntensityLevel}
                onViewModeChange={setViewMode}
                onLutLoad={handleLutDrop}
                onLutClear={clearLUT}
                currentLutName={currentLutName}
                onExport={handleExport}
                canExport={canExport}
                isProcessing={isProcessing}
              />
            </m.aside>
          </>
        )}
      </div>

      {/* Error overlay */}
      <ErrorOverlay
        visible={status === 'error' && !!error}
        message={error || ''}
        onDismiss={dismissError}
      />
    </div>
  )
}

export default RawProcessorView
