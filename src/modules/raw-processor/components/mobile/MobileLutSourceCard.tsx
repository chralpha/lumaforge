import { AlertTriangle, FolderOpen, RefreshCw, Trash2 } from 'lucide-react'

import { Chip } from '~/components/ui/chip'
import { useI18n } from '~/lib/i18n'

import type { UseOnlineLutSourcesResult } from '../../hooks/useOnlineLutSources'

type Resource = UseOnlineLutSourcesResult['state']['resources'][number]
type Issue = UseOnlineLutSourcesResult['state']['issues'][number]

export function MobileLutSourceCard(props: {
  resource: Resource
  entryCount: number
  isLoading: boolean
  issues: Issue[]
  onBrowse: () => void
  onRefresh: () => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const label = props.resource.label || props.resource.url

  return (
    <div
      className="grid gap-1.5 rounded-md bg-lf-paper-warm/55 px-2.5 py-2.5"
      data-raw-mobile-lut="source-card"
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate text-lf-control font-semibold text-lf-ink">
            {label}
          </span>
          <span className="shrink-0 rounded-lf-pill border border-lf-hairline/45 bg-lf-paper px-1.5 py-0.5 text-lf-eyebrow font-semibold leading-none text-lf-ink-soft">
            {t('raw.mobile.lut.entryCount', { count: props.entryCount })}
          </span>
          {props.isLoading && (
            <span
              className="shrink-0 rounded-lf-pill border border-lf-green-deep/30 bg-lf-green-soft/55 px-1.5 py-0.5 text-lf-eyebrow font-semibold leading-none text-lf-green-deep"
              role="status"
            >
              {t('raw.lutSource.loading')}
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label={t('raw.lutSource.open', { label })}
            onClick={props.onBrowse}
            className="grid size-[44px] place-items-center rounded-md border border-lf-hairline/45 bg-lf-paper text-lf-ink/70 transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm hover:text-lf-ink"
          >
            <FolderOpen aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-label={t('raw.lutSource.refresh', { label })}
            aria-busy={props.isLoading}
            disabled={props.isLoading}
            onClick={props.onRefresh}
            className="grid size-[44px] place-items-center rounded-md border border-lf-hairline/45 bg-lf-paper text-lf-ink/70 transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm hover:text-lf-ink disabled:cursor-not-allowed disabled:opacity-50"
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
            className="grid size-[44px] place-items-center rounded-md border border-lf-hairline/45 bg-lf-paper text-lf-ink/70 transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm hover:text-lf-ink"
          >
            <Trash2 aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>
      {props.issues.length > 0 && (
        <ul
          className="m-0 grid list-none gap-1 p-0"
          role="status"
          aria-live="polite"
        >
          {props.issues.map((issue, index) => (
            <li
              key={[
                issue.code,
                issue.entryId ?? issue.sourceUrl ?? 'resource',
                index,
              ].join(':')}
              className="m-0"
            >
              <Chip tone="amber" size="sm" className="max-w-full">
                <AlertTriangle aria-hidden="true" className="size-3 shrink-0" />
                <span className="min-w-0 truncate">{issue.message}</span>
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
