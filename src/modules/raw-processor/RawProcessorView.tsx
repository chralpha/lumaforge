/**
 * Main RAW Processor view component.
 * Combines all sub-components into a complete RAW editing interface.
 */

import { m } from 'motion/react'
import { useCallback } from 'react'

import { clsxm } from '~/lib/cn'
import type { PipelineStats } from '~/lib/gl/pipeline'
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
    lut,
    lutData,
    stats,
    hasImage,
    canExport,
    loadFile,
    loadLUT,
    clearLUT,
    setParams,
    exportImage,
    reset,
    dismissError,
    updateStats,
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
    (format: 'tiff' | 'jpeg') => {
      exportImage(format)
    },
    [exportImage],
  )

  // Handle stats update from canvas
  const handleStatsUpdate = useCallback(
    (newStats: PipelineStats) => {
      updateStats(newStats)
    },
    [updateStats],
  )

  const isProcessing =
    status === 'loading' || status === 'decoding' || status === 'processing'
  const capability = useCapabilityGate()

  if (capability.ready && capability.supportStatus === 'unsupported') {
    return (
      <UnsupportedState reason={capability.reason || 'WebGL2 is required'} />
    )
  }

  return (
    <div className={clsxm('relative flex flex-col h-full', className)}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <i className="i-mingcute-camera-line text-xl text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text">RAW Processor</h1>
            <p className="text-xs text-text-tertiary">
              Browser-based RAW image processing
            </p>
          </div>
        </div>

        {hasImage && (
          <button
            type="button"
            onClick={reset}
            className="text-sm text-text-secondary hover:text-text transition-colors"
          >
            <i className="i-mingcute-close-line mr-1" />
            Close
          </button>
        )}
      </header>

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
                  imageWidth={loadedImage.decoded?.width || 0}
                  imageHeight={loadedImage.decoded?.height || 0}
                  params={params}
                  lutData={lutData}
                  onStatsUpdate={handleStatsUpdate}
                />

                {/* Processing overlay */}
                <ProgressOverlay
                  visible={isProcessing}
                  phase={
                    status === 'loading'
                      ? 'loading'
                      : status === 'decoding'
                        ? 'decoding'
                        : 'processing'
                  }
                  progress={progress}
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
                params={params}
                onParamsChange={setParams}
                lutName={lut?.title}
                onLutLoad={handleLutDrop}
                onLutClear={clearLUT}
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
