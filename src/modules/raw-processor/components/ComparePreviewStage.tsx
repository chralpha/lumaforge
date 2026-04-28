import { clsxm } from '~/lib/cn'
import type {
  LUTData,
  PipelineStats,
  ProcessingParams,
  RawProcessingPipeline,
} from '~/lib/gl/pipeline'
import type { DecodedImage } from '~/lib/raw/decoder'

import { CompareSplitHandle } from './CompareSplitHandle'
import { Dropzone, RAW_FILE_EXTENSIONS } from './Dropzone'
import { PreviewCanvas } from './PreviewCanvas'
import { ProgressOverlay } from './ProgressOverlay'

export interface ComparePreviewStageProps {
  hasImage: boolean
  imageRef: React.RefObject<DecodedImage | null>
  imageVersion: number
  params: ProcessingParams
  lutDataRef: React.RefObject<LUTData | null>
  lutDataVersion: number
  embeddedPreviewUrl?: string | null
  displaySource?: 'embedded' | 'quick' | 'hq' | 'none'
  split: number
  isProcessing: boolean
  progress: number
  phase: 'loading' | 'decoding' | 'processing' | 'exporting'
  recoveryHint?: string
  onRawDrop: (files: File[]) => void
  onSplitChange: (split: number) => void
  onStatsUpdate?: (stats: PipelineStats) => void
  onPipelineChange?: (pipeline: RawProcessingPipeline | null) => void
  className?: string
}

function EmptySampleCompare({ split }: { split: number }) {
  return (
    <div
      className="raw-lab-sample"
      style={
        { '--raw-compare-split': `${split * 100}%` } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <div className="raw-lab-sample-photo" />
      <div className="raw-lab-sample-finish" />
    </div>
  )
}

function UploadDock() {
  return (
    <div className="raw-lab-upload-dock">
      <span className="raw-lab-upload-icon" aria-hidden="true">
        ↑
      </span>
      <span className="raw-lab-upload-copy">
        <strong>Drop one RAW here</strong>
        <span>No upload, no helper, no account</span>
      </span>
    </div>
  )
}

export function ComparePreviewStage({
  hasImage,
  imageRef,
  imageVersion,
  params,
  lutDataRef,
  lutDataVersion,
  embeddedPreviewUrl,
  displaySource = 'none',
  split,
  isProcessing,
  progress,
  phase,
  recoveryHint,
  onRawDrop,
  onSplitChange,
  onStatsUpdate,
  onPipelineChange,
  className,
}: ComparePreviewStageProps) {
  return (
    <section
      className={clsxm('raw-lab-stage', className)}
      aria-label="RAW preview comparison"
    >
      <Dropzone
        variant="stage"
        aria-label={hasImage ? 'Replace RAW file' : 'Load RAW file'}
        onFileDrop={onRawDrop}
        accept={RAW_FILE_EXTENSIONS}
        disabled={isProcessing}
        className="raw-lab-stage-frame"
      >
        {hasImage ? (
          <PreviewCanvas
            imageRef={imageRef}
            imageVersion={imageVersion}
            params={params}
            lutDataRef={lutDataRef}
            lutDataVersion={lutDataVersion}
            embeddedPreviewUrl={embeddedPreviewUrl}
            displaySource={displaySource}
            onStatsUpdate={onStatsUpdate}
            onPipelineChange={onPipelineChange}
          />
        ) : (
          <EmptySampleCompare split={split} />
        )}

        <span className="raw-lab-compare-label raw-lab-compare-label-left">
          Unprocessed RAW
        </span>
        <span className="raw-lab-compare-label raw-lab-compare-label-right">
          Final JPEG
        </span>

        <CompareSplitHandle
          value={split}
          onChange={onSplitChange}
          disabled={isProcessing}
        />

        {!hasImage && <UploadDock />}

        <ProgressOverlay
          visible={isProcessing}
          phase={phase}
          progress={progress}
          recoveryHint={recoveryHint}
        />
      </Dropzone>
    </section>
  )
}
