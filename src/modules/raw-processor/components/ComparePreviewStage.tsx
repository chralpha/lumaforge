import type { LUTData, ProcessingParams } from '@lumaforge/luma-color-runtime'

import { clsxm } from '~/lib/cn'
import type { PipelineStats, RawProcessingPipeline } from '~/lib/gl/pipeline'
import { useI18n } from '~/lib/i18n'
import type { DecodedImage } from '~/lib/raw/decoder'

import type { DisplaySource } from '../model/session'
import type { PreviewViewport } from '../services/preview-viewport'
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
  displaySource?: DisplaySource
  previewSuspended?: boolean
  previewViewport?: PreviewViewport
  split: number
  isProcessing: boolean
  progress: number
  phase: 'loading' | 'decoding' | 'processing' | 'exporting'
  recoveryHint?: string
  onRawDrop: (files: File[]) => void
  onSplitChange: (split: number) => void
  onSplitPreviewChange?: (split: number) => void
  onPreviewViewportChange?: (viewport: PreviewViewport) => void
  onStatsUpdate?: (stats: PipelineStats) => void
  onPipelineChange?: (pipeline: RawProcessingPipeline | null) => void
  className?: string
}

function EmptySampleCompare({ split }: { split: number }) {
  return (
    <div
      className="raw-lab-sample"
      style={
        {
          '--raw-compare-split-committed': `${split * 100}%`,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <div className="raw-lab-sample-photo" />
      <div className="raw-lab-sample-finish" />
    </div>
  )
}

function UploadDock({
  onOpenFilePicker,
  disabled,
}: {
  onOpenFilePicker: () => void
  disabled: boolean
}) {
  const { t } = useI18n()

  return (
    <button
      type="button"
      className="raw-lab-upload-dock"
      onClick={(event) => {
        event.stopPropagation()
        onOpenFilePicker()
      }}
      disabled={disabled}
    >
      <span className="raw-lab-upload-icon" aria-hidden="true">
        ↑
      </span>
      <span className="raw-lab-upload-copy">
        <strong>{t('raw.stage.uploadTitle')}</strong>
        <span>{t('raw.stage.uploadCopy')}</span>
      </span>
    </button>
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
  previewSuspended = false,
  previewViewport,
  split,
  isProcessing,
  progress,
  phase,
  recoveryHint,
  onRawDrop,
  onSplitChange,
  onSplitPreviewChange,
  onPreviewViewportChange,
  onStatsUpdate,
  onPipelineChange,
  className,
}: ComparePreviewStageProps) {
  const { t } = useI18n()

  return (
    <section
      className={clsxm('raw-lab-stage', className)}
      aria-label={t('raw.stage.aria')}
    >
      <Dropzone
        variant="stage"
        aria-label={
          hasImage ? t('raw.stage.replaceAria') : t('raw.stage.loadAria')
        }
        onFileDrop={onRawDrop}
        accept={RAW_FILE_EXTENSIONS}
        disabled={isProcessing}
        clickToOpen={false}
        className="raw-lab-stage-frame"
      >
        {({ openFilePicker, disabled }) => (
          <>
            {hasImage ? (
              <PreviewCanvas
                imageRef={imageRef}
                imageVersion={imageVersion}
                params={params}
                lutDataRef={lutDataRef}
                lutDataVersion={lutDataVersion}
                embeddedPreviewUrl={embeddedPreviewUrl}
                displaySource={displaySource}
                suspended={previewSuspended}
                interactionDisabled={isProcessing}
                previewViewport={previewViewport}
                onPreviewViewportChange={onPreviewViewportChange}
                onStatsUpdate={onStatsUpdate}
                onPipelineChange={onPipelineChange}
              />
            ) : (
              <EmptySampleCompare split={split} />
            )}

            <span className="raw-lab-compare-label raw-lab-compare-label-left">
              {t('raw.stage.leftLabel')}
            </span>
            <span className="raw-lab-compare-label raw-lab-compare-label-right">
              {t('raw.stage.rightLabel')}
            </span>

            <CompareSplitHandle
              value={split}
              onChange={onSplitChange}
              onPreviewChange={onSplitPreviewChange}
              disabled={isProcessing}
            />

            {!hasImage && (
              <UploadDock
                onOpenFilePicker={openFilePicker}
                disabled={disabled}
              />
            )}

            <ProgressOverlay
              visible={isProcessing}
              phase={phase}
              progress={progress}
              recoveryHint={recoveryHint}
            />
          </>
        )}
      </Dropzone>
    </section>
  )
}
