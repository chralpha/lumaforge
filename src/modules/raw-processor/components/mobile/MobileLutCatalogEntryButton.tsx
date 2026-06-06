import { Loader2 } from 'lucide-react'

import { useI18n } from '~/lib/i18n'
import type { OnlineLUTPreviewAsset } from '~/lib/profiles/catalog'

import { OnlineLutPreviewThumb } from '../tools/lut/OnlineLutPreviewThumb'

export function MobileLutCatalogEntryButton(props: {
  title: string
  preview?: OnlineLUTPreviewAsset
  loading: boolean
  disabled: boolean
  ariaLabel: string
  onClick: () => void
}) {
  const { t } = useI18n()

  return (
    <button
      type="button"
      aria-label={props.ariaLabel}
      aria-busy={props.loading || undefined}
      disabled={props.disabled || props.loading}
      onClick={props.onClick}
      className="grid min-h-[52px] min-w-0 grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors duration-150 hover:bg-lf-on-photo-bg-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green disabled:cursor-not-allowed disabled:opacity-50"
      data-raw-mobile-lut="catalog-entry"
      data-raw-mobile-lut-entry-loading={props.loading ? 'true' : undefined}
    >
      <OnlineLutPreviewThumb
        preview={props.preview}
        size="mobile"
        surface="mobile"
      />
      <span className="min-w-0 truncate text-lf-control font-medium text-lf-on-photo-ink">
        {props.title}
      </span>
      {props.loading ? (
        <Loader2
          aria-hidden="true"
          className="size-4 animate-spin text-lf-green-soft motion-reduce:animate-none"
        />
      ) : (
        <span className="text-xs font-semibold text-lf-green-soft">
          {t('raw.mobile.lut.load')}
        </span>
      )}
    </button>
  )
}
