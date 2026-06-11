import { ChevronRight, Plus, Share2, TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'

import { Input } from '~/components/ui/input'
import { useI18n } from '~/lib/i18n'

import type {
  OnlineLutEntryLoadProgress,
  UseOnlineLutSourcesResult,
} from '../../hooks/useOnlineLutSources'
import { entryLoadPercent } from '../tools/lut/OnlineLutSourceResourceList'
import { useOnlineLutEntryLoader } from '../tools/lut/useOnlineLutEntryLoader'
import { MobileLutSourceCard } from './MobileLutSourceCard'

type OnlineEntry = UseOnlineLutSourcesResult['state']['entries'][number]
type OnlineIssue = UseOnlineLutSourcesResult['state']['issues'][number]

const inlineEntryLimit = 4

export interface MobileLutOnlineSourcesSectionProps {
  onlineLutSources?: UseOnlineLutSourcesResult
  sourceInputId: string
  entriesByResourceId: ReadonlyMap<string, OnlineEntry[]>
  issuesByResourceId: ReadonlyMap<string, OnlineIssue[]>
  onBrowseResource: (resourceId: string) => void
}

export function MobileLutOnlineSourcesSection({
  onlineLutSources,
  sourceInputId,
  entriesByResourceId,
  issuesByResourceId,
  onBrowseResource,
}: MobileLutOnlineSourcesSectionProps) {
  const { t } = useI18n()
  const { loadingEntryId, failedEntryId, loadOnlineLutEntry } =
    useOnlineLutEntryLoader(onlineLutSources)
  const entryLoadProgress = onlineLutSources?.entryLoadProgress ?? null
  const cancelEntryLoad = onlineLutSources?.cancelEntryLoad

  if (!onlineLutSources) return null

  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-lf-body font-semibold text-lf-on-photo-ink">
          {t('raw.mobile.lut.onlineHeading')}
        </h3>
        <button
          type="button"
          aria-label={t('raw.lutSource.copy')}
          disabled={!onlineLutSources.share.enabled}
          onClick={() => {
            void onlineLutSources.share.copy().then(
              () => toast.success(t('raw.lutSource.copied')),
              () => toast.error(t('raw.lutSource.copyFailed')),
            )
          }}
          className="grid size-[44px] shrink-0 place-items-center rounded-md bg-transparent text-lf-on-photo-ink/55 transition-colors hover:bg-lf-on-photo-bg-strong hover:text-lf-on-photo-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Share2 aria-hidden="true" className="size-5" />
        </button>
      </div>
      <form
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!onlineLutSources.sourceUrlInput.trim()) {
            return
          }
          void onlineLutSources.addSourceFromInput()
        }}
      >
        <label htmlFor={sourceInputId} className="sr-only">
          {t('raw.lutSource.url')}
        </label>
        <Input
          id={sourceInputId}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={onlineLutSources.sourceUrlInput}
          placeholder="https://.../catalog.json"
          onChange={(event) =>
            onlineLutSources.setSourceUrlInput(event.currentTarget.value)
          }
          inputClassName="h-[44px] rounded-md border-transparent bg-lf-on-photo-bg text-lf-control text-lf-on-photo-ink shadow-none placeholder:text-lf-on-photo-ink/40 focus:border-transparent focus:bg-lf-on-photo-bg-strong focus:ring-2 focus:ring-lf-green/25"
        />
        <button
          type="submit"
          aria-label={t('raw.lutSource.add')}
          disabled={!onlineLutSources.sourceUrlInput.trim()}
          className="grid size-[44px] shrink-0 place-items-center rounded-md bg-transparent text-lf-on-photo-ink/55 transition-colors hover:bg-lf-on-photo-bg-strong hover:text-lf-on-photo-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
      </form>
      {onlineLutSources.state.resources.length === 0 && (
        <p className="m-0 text-xs leading-relaxed text-lf-on-photo-ink/64">
          {t('raw.lutSource.emptyHint')}
        </p>
      )}
      <div className="grid gap-2" aria-busy={onlineLutSources.state.isLoading}>
        {onlineLutSources.state.isLoading && (
          <p
            className="m-0 rounded-md border border-lf-green/35 bg-lf-green/15 px-2.5 py-2 text-xs font-semibold text-lf-green-soft"
            role="status"
          >
            {t('raw.mobile.lut.loading')}
          </p>
        )}
        {onlineLutSources.state.resources.map((resource) => {
          const entries = entriesByResourceId.get(resource.id) ?? []
          const resourceIssues = issuesByResourceId.get(resource.id) ?? []
          const isResourceLoading =
            onlineLutSources.state.isLoading &&
            onlineLutSources.state.activeResourceId === resource.id

          return (
            <div key={resource.id} className="grid gap-1.5">
              <MobileLutSourceCard
                resource={resource}
                entryCount={entries.length}
                isLoading={isResourceLoading}
                issues={resourceIssues}
                onRefresh={() =>
                  void onlineLutSources.refreshSource(resource.id)
                }
                onRemove={() => onlineLutSources.removeSource(resource.id)}
              />
              <MobileLutInlineEntryStrip
                entries={entries}
                entryCount={entries.length}
                loadingEntryId={loadingEntryId}
                failedEntryId={failedEntryId}
                entryLoadProgress={entryLoadProgress}
                onEntryLoad={(entryId) => {
                  void loadOnlineLutEntry(entryId)
                }}
                onCancelEntryLoad={cancelEntryLoad}
                onBrowseAll={() => onBrowseResource(resource.id)}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function MobileLutInlineEntryStrip({
  entries,
  entryCount,
  loadingEntryId,
  failedEntryId,
  entryLoadProgress,
  onEntryLoad,
  onCancelEntryLoad,
  onBrowseAll,
}: {
  entries: OnlineEntry[]
  entryCount: number
  loadingEntryId: string | null
  failedEntryId: string | null
  entryLoadProgress: OnlineLutEntryLoadProgress | null
  onEntryLoad: (entryId: string) => void
  onCancelEntryLoad?: () => void
  onBrowseAll: () => void
}) {
  const { t } = useI18n()
  const visibleEntries = entries.slice(0, inlineEntryLimit)

  return (
    <div
      className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      data-raw-mobile-lut="source-inline-entries"
    >
      {visibleEntries.map((entry) => {
        const isLoading = loadingEntryId === entry.id
        const isLocked = loadingEntryId !== null && !isLoading
        const isFailed = failedEntryId === entry.id
        return (
          <MobileLutInlineEntryPill
            key={entry.id}
            title={entry.title}
            isLoading={isLoading}
            isLocked={isLocked}
            isFailed={isFailed}
            percent={
              isLoading && entryLoadProgress?.entryId === entry.id
                ? entryLoadPercent(entryLoadProgress)
                : null
            }
            ariaLabel={
              isLoading
                ? t('raw.lutSource.cancelDownload', { label: entry.title })
                : isFailed
                  ? t('raw.lutSource.loadFailedRetry', { label: entry.title })
                  : t('raw.mobile.lut.loadEntry', { label: entry.title })
            }
            onClick={() =>
              isLoading ? onCancelEntryLoad?.() : onEntryLoad(entry.id)
            }
          />
        )
      })}
      <button
        type="button"
        onClick={onBrowseAll}
        className="inline-flex min-h-[44px] shrink-0 snap-start items-center gap-1 rounded-lf-pill border border-lf-green/40 bg-lf-green/12 px-3.5 text-lf-label font-semibold text-lf-green-soft transition-colors hover:border-lf-green/65 hover:text-lf-on-photo-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green"
        data-raw-mobile-lut="source-inline-browse"
      >
        <span className="whitespace-nowrap">
          {t('raw.mobile.lut.browseEntries', { count: entryCount })}
        </span>
        <ChevronRight aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
}

function MobileLutInlineEntryPill({
  title,
  isLoading,
  isLocked,
  isFailed,
  percent,
  ariaLabel,
  onClick,
}: {
  title: string
  isLoading: boolean
  isLocked: boolean
  isFailed: boolean
  percent: number | null
  ariaLabel: string
  onClick: () => void
}) {
  const disabled = isLocked

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-busy={isLoading || undefined}
      disabled={disabled}
      onClick={onClick}
      data-raw-mobile-lut="source-inline-entry"
      data-raw-mobile-lut-entry-loading={isLoading ? 'true' : undefined}
      data-raw-mobile-lut-entry-failed={isFailed ? 'true' : undefined}
      className={[
        'inline-flex min-h-[44px] max-w-[14rem] shrink-0 snap-start items-center gap-1.5 rounded-lf-pill border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-3.5 text-lf-control font-medium text-lf-on-photo-ink/85 transition-colors hover:border-lf-on-photo-bord hover:bg-lf-on-photo-bg-strong hover:text-lf-on-photo-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green',
        isLocked
          ? 'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-lf-on-photo-bord-soft disabled:hover:bg-lf-on-photo-bg disabled:hover:text-lf-on-photo-ink/85'
          : '',
        isFailed
          ? 'border-lf-amber/45 bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.10)]'
          : '',
      ].join(' ')}
    >
      <span className="truncate">{title}</span>
      {isLoading ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[0.7rem] font-semibold text-lf-on-photo-text-soft tabular-nums">
          {percent !== null && <span>{percent}%</span>}
          <X aria-hidden="true" className="size-3.5" />
        </span>
      ) : isFailed ? (
        <TriangleAlert
          aria-hidden="true"
          className="size-3.5 shrink-0 text-lf-amber"
        />
      ) : null}
    </button>
  )
}
