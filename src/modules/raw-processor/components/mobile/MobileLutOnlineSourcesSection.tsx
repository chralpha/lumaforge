import { Plus, Share2 } from 'lucide-react'
import { toast } from 'sonner'

import { Input } from '~/components/ui/input'
import { useI18n } from '~/lib/i18n'

import type { UseOnlineLutSourcesResult } from '../../hooks/useOnlineLutSources'
import { useOnlineLutEntryLoader } from '../tools/lut/useOnlineLutEntryLoader'
import { MobileLutCatalogEntryButton } from './MobileLutCatalogEntryButton'
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
  const { loadingEntryId, loadOnlineLutEntry } = useOnlineLutEntryLoader(
    onlineLutSources?.loadEntry,
  )

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
              <MobileLutInlineEntries
                entries={entries}
                loadingEntryId={loadingEntryId}
                onEntryLoad={(entryId) => {
                  void loadOnlineLutEntry(entryId)
                }}
              />
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-3 text-lf-control font-semibold text-lf-on-photo-ink/76 transition-colors hover:bg-lf-on-photo-bg-strong hover:text-lf-on-photo-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green"
                onClick={() => onBrowseResource(resource.id)}
              >
                {t('raw.mobile.lut.browseEntries', {
                  count: entries.length,
                })}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function MobileLutInlineEntries({
  entries,
  loadingEntryId,
  onEntryLoad,
}: {
  entries: OnlineEntry[]
  loadingEntryId: string | null
  onEntryLoad: (entryId: string) => void
}) {
  const { t } = useI18n()
  const visibleEntries = entries.slice(0, inlineEntryLimit)

  if (visibleEntries.length === 0) return null

  return (
    <div className="grid gap-1.5" data-raw-mobile-lut="source-inline-entries">
      {visibleEntries.map((entry) => (
        <MobileLutCatalogEntryButton
          key={entry.id}
          title={entry.title}
          loading={loadingEntryId === entry.id}
          disabled={false}
          ariaLabel={t('raw.mobile.lut.loadEntry', { label: entry.title })}
          onClick={() => onEntryLoad(entry.id)}
        />
      ))}
    </div>
  )
}
