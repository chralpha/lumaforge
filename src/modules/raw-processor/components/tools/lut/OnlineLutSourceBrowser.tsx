import { Download, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { useI18n } from '~/lib/i18n'

import { formatBytes } from '../../../format-bytes'
import type {
  OnlineLutEntryLoadProgress,
  UseOnlineLutSourcesResult,
} from '../../../hooks/useOnlineLutSources'
import type { OnlineLutBrowserLayout } from './lut-browser-layout'
import { groupEntriesByFamily } from './lut-source-grouping'
import { LutBrowserDialog } from './LutBrowserDialog'
import { LutIconButton } from './LutIconButton'
import { OnlineLutPreviewThumb } from './OnlineLutPreviewThumb'
import { entryLoadPercent } from './OnlineLutSourceResourceList'

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
  failedEntryId,
  entryLoadProgress,
  listRef,
  triggerElement,
  passthroughElements,
  restoreFocus,
  onClose,
  onEntryLoad,
  onCancelEntryLoad,
}: {
  id: string
  resource: OnlineLutResource
  entries: OnlineLutEntry[]
  issues: OnlineLutIssue[]
  layout: OnlineLutBrowserLayout
  loadingEntryId: string | null
  failedEntryId: string | null
  entryLoadProgress: OnlineLutEntryLoadProgress | null
  listRef: (node: HTMLDivElement | null) => void
  triggerElement?: HTMLElement
  passthroughElements: () => Iterable<HTMLElement>
  restoreFocus: () => void
  onClose: () => void
  onEntryLoad: (entryId: string) => void
  onCancelEntryLoad: () => void
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
            failedEntryId={failedEntryId}
            entryLoadProgress={entryLoadProgress}
            onCancelEntryLoad={onCancelEntryLoad}
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
  failedEntryId,
  entryLoadProgress,
  onEntryLoad,
  onCancelEntryLoad,
}: {
  entries: OnlineLutEntry[]
  loadingEntryId: string | null
  failedEntryId: string | null
  entryLoadProgress: OnlineLutEntryLoadProgress | null
  onEntryLoad: (entryId: string) => void
  onCancelEntryLoad: () => void
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
        isFailed={failedEntryId === entry.id}
        progress={
          entryLoadProgress?.entryId === entry.id ? entryLoadProgress : null
        }
        onLoad={() => onEntryLoad(entry.id)}
        onCancel={onCancelEntryLoad}
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
  isFailed,
  progress,
  onLoad,
  onCancel,
}: {
  entry: OnlineLutEntry
  isLoading: boolean
  isFailed: boolean
  progress: OnlineLutEntryLoadProgress | null
  onLoad: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const percent = isLoading ? entryLoadPercent(progress) : null
  const sizeLabel = entry.cube.bytes ? formatBytes(entry.cube.bytes) : null
  const metaLabel =
    isLoading && progress
      ? percent !== null
        ? `${percent}% · ${formatBytes(progress.receivedBytes)}`
        : formatBytes(progress.receivedBytes)
      : sizeLabel

  return (
    <div
      className={[
        'relative grid min-h-11 min-w-0 grid-cols-[48px_minmax(0,1fr)_28px] items-center gap-2 overflow-hidden rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.045)]',
        isFailed ? 'bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.08)]' : '',
      ].join(' ')}
      data-raw-lut="source-entry"
      data-raw-lut-entry-loading={isLoading ? 'true' : undefined}
      data-raw-lut-entry-failed={isFailed ? 'true' : undefined}
    >
      <OnlineLutPreviewThumb preview={entry.preview} size="row" />
      <span className="grid min-w-0 gap-0.5">
        <span className="min-w-0 truncate text-[0.74rem] leading-[1.35] text-lf-on-surface/75">
          {entry.title}
        </span>
        {metaLabel && (
          <span className="min-w-0 truncate text-[0.64rem] leading-none text-lf-on-surface/45 tabular-nums">
            {metaLabel}
          </span>
        )}
      </span>
      <LutIconButton
        label={
          isLoading
            ? t('raw.lutSource.cancelDownload', { label: entry.title })
            : isFailed
              ? t('raw.lutSource.loadFailedRetry', { label: entry.title })
              : t('raw.lutSource.load', { label: entry.title })
        }
        busy={isLoading}
        onClick={isLoading ? onCancel : onLoad}
      >
        {isLoading ? (
          <X aria-hidden="true" />
        ) : isFailed ? (
          <TriangleAlert aria-hidden="true" className="text-lf-amber" />
        ) : (
          <Download aria-hidden="true" />
        )}
      </LutIconButton>
      {isLoading && percent !== null && (
        <span
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t('raw.lutSource.load', { label: entry.title })}
          className="absolute inset-x-0 bottom-0 h-0.5 bg-[oklch(0.96_0.006_255/0.05)]"
        >
          <span
            className="block h-full bg-lf-green/70 transition-[width] duration-150 ease-out"
            style={{ width: `${percent}%` }}
          />
        </span>
      )}
    </div>
  )
}
