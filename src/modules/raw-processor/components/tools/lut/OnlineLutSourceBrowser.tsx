import { Download, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { useI18n } from '~/lib/i18n'

import type { UseOnlineLutSourcesResult } from '../../../hooks/useOnlineLutSources'
import type { OnlineLutBrowserLayout } from './lut-browser-layout'
import { groupEntriesByFamily } from './lut-source-grouping'
import { LutBrowserDialog } from './LutBrowserDialog'
import { LutIconButton } from './LutIconButton'

type OnlineLutResource = UseOnlineLutSourcesResult['state']['resources'][number]
type OnlineLutEntry = UseOnlineLutSourcesResult['state']['entries'][number]
type OnlineLutIssue = UseOnlineLutSourcesResult['state']['issues'][number]

export function OnlineLutSourceBrowser({
  id,
  resource,
  entries,
  issues,
  layout,
  loadingEntryId,
  listRef,
  triggerElement,
  passthroughElements,
  restoreFocus,
  onClose,
  onEntryLoad,
}: {
  id: string
  resource: OnlineLutResource
  entries: OnlineLutEntry[]
  issues: OnlineLutIssue[]
  layout: OnlineLutBrowserLayout
  loadingEntryId: string | null
  listRef: (node: HTMLDivElement | null) => void
  triggerElement?: HTMLElement
  passthroughElements: () => Iterable<HTMLElement>
  restoreFocus: () => void
  onClose: () => void
  onEntryLoad: (entryId: string) => void
}) {
  const { t } = useI18n()
  const formatEntryCount = (count: number) =>
    count === 1
      ? t('raw.lutSource.countOne')
      : count > 1
        ? t('raw.lutSource.countMany', { count })
        : t('raw.lutSource.countZero')

  return (
    <LutBrowserDialog
      key={resource.id}
      open
      layout={layout}
      id={id}
      kind="source"
      className="grid-rows-[auto_minmax(0,1fr)]"
      dialogLabel={`${resource.label} LUTs`}
      title={resource.label}
      description={formatEntryCount(entries.length)}
      closeLabel={t('raw.lutSource.close')}
      restoreFocus={restoreFocus}
      triggerElement={triggerElement}
      passthroughElements={passthroughElements}
      fillHeight={false}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <div
        ref={listRef}
        className="grid min-h-0 content-start gap-2 overflow-y-auto overscroll-contain pr-0.5"
        data-raw-lut="source-browser-list"
        data-lut-source-scroll="internal"
      >
        {entries.length > 0 ? (
          <OnlineLutSourceEntryGroups
            entries={entries}
            loadingEntryId={loadingEntryId}
            onEntryLoad={onEntryLoad}
          />
        ) : (
          <p className="text-[0.78rem] leading-relaxed text-lf-on-surface/72">
            {issues.length > 0
              ? t('raw.lutSource.noneCompatible')
              : t('raw.lutSource.noneYet')}
          </p>
        )}
      </div>
    </LutBrowserDialog>
  )
}

function OnlineLutSourceEntryGroups({
  entries,
  loadingEntryId,
  onEntryLoad,
}: {
  entries: OnlineLutEntry[]
  loadingEntryId: string | null
  onEntryLoad: (entryId: string) => void
}) {
  const { t } = useI18n()
  const { families, others } = groupEntriesByFamily(entries)
  const renderEntry = (entry: OnlineLutEntry) => {
    const isLoading = loadingEntryId === entry.id

    return (
      <OnlineLutSourceEntryRow
        key={entry.id}
        entry={entry}
        isLoading={isLoading}
        onLoad={() => onEntryLoad(entry.id)}
      />
    )
  }

  return (
    <>
      {families.map(({ family, items }) => (
        <OnlineLutSourceEntrySection key={family} title={family}>
          {items.map(renderEntry)}
        </OnlineLutSourceEntrySection>
      ))}
      {others.length > 0 && (
        <OnlineLutSourceEntrySection title={t('raw.lutSource.others')}>
          {others.map(renderEntry)}
        </OnlineLutSourceEntrySection>
      )}
    </>
  )
}

function OnlineLutSourceEntrySection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1">
      <div className="px-1 text-[0.7rem] font-medium tracking-tight text-lf-on-surface/50">
        {title}
      </div>
      <div className="grid gap-0.5 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function OnlineLutSourceEntryRow({
  entry,
  isLoading,
  onLoad,
}: {
  entry: OnlineLutEntry
  isLoading: boolean
  onLoad: () => void
}) {
  const { t } = useI18n()

  return (
    <div
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_28px] items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.045)]"
      data-raw-lut="source-entry"
      data-raw-lut-entry-loading={isLoading ? 'true' : undefined}
    >
      <span className="min-w-0 truncate text-[0.74rem] leading-[1.35] text-lf-on-surface/75">
        {entry.title}
      </span>
      <LutIconButton
        label={t('raw.lutSource.load', {
          label: entry.title,
        })}
        busy={isLoading}
        disabled={isLoading}
        onClick={onLoad}
      >
        {isLoading ? (
          <Loader2 aria-hidden="true" />
        ) : (
          <Download aria-hidden="true" />
        )}
      </LutIconButton>
    </div>
  )
}
