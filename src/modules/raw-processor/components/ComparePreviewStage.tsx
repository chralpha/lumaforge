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
      data-raw-upload-dock
      className="absolute bottom-[clamp(52px,7vw,78px)] left-1/2 z-[5] flex min-w-[min(320px,calc(100%-36px))] -translate-x-1/2 items-center gap-3 rounded-md border border-[var(--color-stage-hairline)] bg-[var(--color-stage-panel)] px-3 py-2.5 text-[var(--color-on-stage)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 max-[640px]:bottom-[18px] max-[640px]:min-w-[min(300px,calc(100%-28px))]"
      onClick={(event) => {
        event.stopPropagation()
        onOpenFilePicker()
      }}
      disabled={disabled}
    >
      <span
        className="grid size-[34px] shrink-0 place-items-center rounded-[5px] bg-accent font-bold text-background"
        aria-hidden="true"
      >
        ↑
      </span>
      <span className="block">
        <strong className="block text-sm leading-tight">
          {t('raw.stage.uploadTitle')}
        </strong>
        <span className="mt-0.5 block text-xs leading-snug text-[var(--color-on-stage-soft)]">
          {t('raw.stage.uploadCopy')}
        </span>
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

            <span className="raw-lab-compare-label pointer-events-none absolute bottom-[18px] left-[18px] z-[4] max-w-[calc(50%-32px)] rounded-full border border-[var(--color-stage-hairline)] bg-[var(--color-stage-panel)] px-2.5 py-1.5 text-xs font-medium leading-tight text-[var(--color-on-stage)] opacity-0 transition-opacity duration-200 max-[640px]:max-w-[calc(50%-22px)]">
              {t('raw.stage.leftLabel')}
            </span>
            <span className="raw-lab-compare-label absolute bottom-[18px] right-[18px] left-auto z-[4] max-w-[calc(50%-32px)] rounded-full border border-[var(--color-stage-hairline)] bg-[var(--color-stage-panel)] px-2.5 py-1.5 pointer-events-none text-xs font-medium leading-tight text-[var(--color-on-stage)] opacity-0 transition-opacity duration-200 max-[640px]:max-w-[calc(50%-22px)]">
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
