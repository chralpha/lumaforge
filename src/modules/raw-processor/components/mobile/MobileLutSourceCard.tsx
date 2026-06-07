import { RefreshCw, Trash2 } from 'lucide-react'

import { useI18n } from '~/lib/i18n'

import type { UseOnlineLutSourcesResult } from '../../hooks/useOnlineLutSources'
import { LutSourceWarning } from '../tools/lut/LutSourceWarning'

type Resource = UseOnlineLutSourcesResult['state']['resources'][number]
type Issue = UseOnlineLutSourcesResult['state']['issues'][number]

export function MobileLutSourceCard(props: {
  resource: Resource
  entryCount: number
  isLoading: boolean
  issues: Issue[]
  onRefresh: () => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const label = props.resource.label || props.resource.url

  return (
    <div
      className="grid gap-1.5 bg-transparent px-1 py-1"
      data-raw-mobile-lut="source-card"
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate text-lf-control font-medium text-lf-on-photo-ink/85">
            {label}
          </span>
          <span className="shrink-0 rounded-lf-pill border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-1.5 py-0.5 text-lf-eyebrow font-medium leading-none text-lf-on-photo-ink/62">
            {t('raw.mobile.lut.entryCount', { count: props.entryCount })}
          </span>
          {props.isLoading && (
            <output className="shrink-0 rounded-lf-pill border border-lf-green/35 bg-lf-green/15 px-1.5 py-0.5 text-lf-eyebrow font-medium leading-none text-lf-green-soft">
              {t('raw.lutSource.loading')}
            </output>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label={t('raw.lutSource.refresh', { label })}
            aria-busy={props.isLoading}
            disabled={props.isLoading}
            onClick={props.onRefresh}
            className="grid size-[44px] place-items-center rounded-md bg-transparent text-lf-on-photo-ink/55 transition-colors hover:bg-lf-on-photo-bg-strong hover:text-lf-on-photo-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-5 ${props.isLoading ? 'animate-spin motion-reduce:animate-none' : ''}`}
            />
          </button>
          <button
            type="button"
            aria-label={t('raw.lutSource.remove', { label })}
            onClick={props.onRemove}
            className="grid size-[44px] place-items-center rounded-md bg-transparent text-lf-on-photo-ink/55 transition-colors hover:bg-lf-on-photo-bg-strong hover:text-lf-on-photo-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green"
          >
            <Trash2 aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>
      <LutSourceWarning issues={props.issues} surface="on-photo" />
    </div>
  )
}
