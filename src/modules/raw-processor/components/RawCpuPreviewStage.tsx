import type { LUTData, ProcessingParams } from '@lumaforge/luma-color-runtime'
import { useState } from 'react'

import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'
import type { DecodedImage } from '~/lib/raw/decoder'

import { useCpuPreview } from '../hooks/useCpuPreview'
import { CpuPreviewCanvas } from './CpuPreviewCanvas'

export interface RawCpuPreviewStageProps {
  image: DecodedImage | null
  imageVersion: number
  params: ProcessingParams
  lut: LUTData | null
  fallbackThumbnailUrl: string | null
}

export function RawCpuPreviewStage({
  image,
  imageVersion,
  params,
  lut,
  fallbackThumbnailUrl,
}: RawCpuPreviewStageProps) {
  const { t } = useI18n()
  const [variant, setVariant] = useState<'processed' | 'neutral'>('processed')
  const cpuPreview = useCpuPreview({
    enabled: Boolean(image),
    image,
    imageVersion,
    params: {
      styleKind: params.styleKind,
      intensity: params.intensity,
      builtinPreset: params.builtinPreset,
      lut,
      rawRenderExposure: image?.renderExposure ?? {
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
      userTemperature: params.userTemperature,
      userTint: params.userTint,
    },
    variant,
  })

  return (
    <section
      className="raw-lab-stage relative flex flex-col"
      aria-label={t('raw.stage.aria')}
    >
      <CpuPreviewCanvas
        frame={cpuPreview.frame}
        inFlight={cpuPreview.inFlight}
        failureReason={cpuPreview.failureReason}
        fallbackThumbnailUrl={fallbackThumbnailUrl}
        className="min-h-0 flex-1"
      />
      {image && (
        <div className="flex shrink-0 justify-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => setVariant('processed')}
            className={clsxm(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              variant === 'processed'
                ? 'border-lf-green/60 bg-lf-green/10 text-lf-on-photo-ink'
                : 'border-lf-on-photo-bord-soft bg-lf-on-photo-bg-strong text-lf-on-photo-ink/60 hover:text-lf-on-photo-ink',
            )}
          >
            {t('raw.preview.cpuDegraded.showProcessed')}
          </button>
          <button
            type="button"
            onClick={() => setVariant('neutral')}
            className={clsxm(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              variant === 'neutral'
                ? 'border-lf-green/60 bg-lf-green/10 text-lf-on-photo-ink'
                : 'border-lf-on-photo-bord-soft bg-lf-on-photo-bg-strong text-lf-on-photo-ink/60 hover:text-lf-on-photo-ink',
            )}
          >
            {t('raw.preview.cpuDegraded.showOriginal')}
          </button>
        </div>
      )}
    </section>
  )
}
