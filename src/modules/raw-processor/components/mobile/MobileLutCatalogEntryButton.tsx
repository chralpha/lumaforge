import { TriangleAlert, X } from 'lucide-react'

import { useI18n } from '~/lib/i18n'
import type { OnlineLUTPreviewAsset } from '~/lib/profiles/catalog'

import { formatBytes } from '../../format-bytes'
import type { OnlineLutEntryLoadProgress } from '../../hooks/useOnlineLutSources'
import { OnlineLutPreviewThumb } from '../tools/lut/OnlineLutPreviewThumb'
import { entryLoadPercent } from '../tools/lut/OnlineLutSourceResourceList'

export function MobileLutCatalogEntryButton(props: {
  title: string
  preview?: OnlineLUTPreviewAsset
  loading: boolean
  failed?: boolean
  sizeBytes?: number
  progress?: OnlineLutEntryLoadProgress | null
  disabled: boolean
  ariaLabel: string
  onClick: () => void
  onCancel?: () => void
}) {
  const { t } = useI18n()
  const percent = props.loading
    ? entryLoadPercent(props.progress ?? null)
    : null
  const metaLabel =
    props.loading && props.progress
      ? percent !== null
        ? `${percent}% · ${formatBytes(props.progress.receivedBytes)}`
        : formatBytes(props.progress.receivedBytes)
      : props.sizeBytes
        ? formatBytes(props.sizeBytes)
        : null
  const cancelLabel = t('raw.lutSource.cancelDownload', { label: props.title })

  return (
    <button
      type="button"
      aria-label={props.loading ? cancelLabel : props.ariaLabel}
      aria-busy={props.loading || undefined}
      disabled={props.disabled}
      onClick={
        props.loading ? (props.onCancel ?? props.onClick) : props.onClick
      }
      className="relative grid min-h-[52px] min-w-0 grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-md px-2.5 py-2 text-left transition-colors duration-150 hover:bg-lf-on-photo-bg-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green disabled:cursor-not-allowed disabled:opacity-50"
      data-raw-mobile-lut="catalog-entry"
      data-raw-mobile-lut-entry-loading={props.loading ? 'true' : undefined}
      data-raw-mobile-lut-entry-failed={props.failed ? 'true' : undefined}
    >
      <OnlineLutPreviewThumb
        preview={props.preview}
        size="mobile"
        surface="mobile"
      />
      <span className="grid min-w-0 gap-0.5">
        <span className="min-w-0 truncate text-lf-control font-medium text-lf-on-photo-ink">
          {props.title}
        </span>
        {metaLabel && (
          <span className="min-w-0 truncate text-[0.68rem] leading-none text-lf-on-photo-text-meta tabular-nums">
            {metaLabel}
          </span>
        )}
      </span>
      {props.loading ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-lf-on-photo-text-soft">
          <X aria-hidden="true" className="size-4" />
          {t('raw.mobile.lut.cancel')}
        </span>
      ) : props.failed ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-lf-amber">
          <TriangleAlert aria-hidden="true" className="size-3.5" />
          {t('raw.mobile.lut.retry')}
        </span>
      ) : (
        <span className="text-xs font-semibold text-lf-green-soft">
          {t('raw.mobile.lut.load')}
        </span>
      )}
      {props.loading && percent !== null && (
        <span
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={props.ariaLabel}
          className="absolute inset-x-0 bottom-0 h-0.5 bg-[oklch(0.96_0.006_255/0.05)]"
        >
          <span
            className="block h-full bg-lf-green/70 transition-[width] duration-150 ease-out"
            style={{ width: `${percent}%` }}
          />
        </span>
      )}
    </button>
  )
}
