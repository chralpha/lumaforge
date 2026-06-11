import {
  Aperture,
  Download,
  FolderOpen,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'

import { useI18n } from '~/lib/i18n'

import { formatBytes } from '../../../format-bytes'
import type {
  OnlineLutEntryLoadProgress,
  UseOnlineLutSourcesResult,
} from '../../../hooks/useOnlineLutSources'
import { LutIconButton } from './LutIconButton'
import { LutSourceWarning } from './LutSourceWarning'

type OnlineLutResource = UseOnlineLutSourcesResult['state']['resources'][number]
type OnlineLutEntry = UseOnlineLutSourcesResult['state']['entries'][number]
type OnlineLutIssue = UseOnlineLutSourcesResult['state']['issues'][number]

const inlineEntryLimit = 4

export function OnlineLutSourceResourceList({
  resources,
  isLoading,
  activeResourceId,
  loadingEntryId,
  failedEntryId,
  entryLoadProgress,
  entriesByResourceId,
  issuesByResourceId,
  openResourceId,
  browserId,
  onOpenResource,
  onCloseResource,
  onRefreshResource,
  onRemoveResource,
  onEntryLoad,
  onCancelEntryLoad,
  setOpenButtonRef,
}: {
  resources: OnlineLutResource[]
  isLoading: boolean
  activeResourceId: string | null
  loadingEntryId: string | null
  failedEntryId: string | null
  entryLoadProgress: OnlineLutEntryLoadProgress | null
  entriesByResourceId: ReadonlyMap<string, OnlineLutEntry[]>
  issuesByResourceId: ReadonlyMap<string, OnlineLutIssue[]>
  openResourceId: string | null
  browserId: string
  onOpenResource: (resourceId: string) => void
  onCloseResource: (resourceId: string) => void
  onRefreshResource: (resourceId: string) => void
  onRemoveResource: (resourceId: string) => void
  onEntryLoad: (entryId: string) => void
  onCancelEntryLoad: () => void
  setOpenButtonRef: (resourceId: string, node: HTMLButtonElement | null) => void
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      {resources.map((resource) => (
        <OnlineLutSourceResourceRow
          key={resource.id}
          resource={resource}
          isLoading={isLoading && activeResourceId === resource.id}
          entries={entriesByResourceId.get(resource.id) ?? []}
          issues={issuesByResourceId.get(resource.id) ?? []}
          isOpen={openResourceId === resource.id}
          loadingEntryId={loadingEntryId}
          failedEntryId={failedEntryId}
          entryLoadProgress={entryLoadProgress}
          browserId={browserId}
          onOpen={() => onOpenResource(resource.id)}
          onClose={() => onCloseResource(resource.id)}
          onRefresh={() => onRefreshResource(resource.id)}
          onRemove={() => onRemoveResource(resource.id)}
          onEntryLoad={onEntryLoad}
          onCancelEntryLoad={onCancelEntryLoad}
          setOpenButtonRef={(node) => setOpenButtonRef(resource.id, node)}
        />
      ))}
    </div>
  )
}

function OnlineLutSourceResourceRow({
  resource,
  isLoading,
  entries,
  issues,
  isOpen,
  loadingEntryId,
  failedEntryId,
  entryLoadProgress,
  browserId,
  onOpen,
  onClose,
  onRefresh,
  onRemove,
  onEntryLoad,
  onCancelEntryLoad,
  setOpenButtonRef,
}: {
  resource: OnlineLutResource
  isLoading: boolean
  entries: OnlineLutEntry[]
  issues: OnlineLutIssue[]
  isOpen: boolean
  loadingEntryId: string | null
  failedEntryId: string | null
  entryLoadProgress: OnlineLutEntryLoadProgress | null
  browserId: string
  onOpen: () => void
  onClose: () => void
  onRefresh: () => void
  onRemove: () => void
  onEntryLoad: (entryId: string) => void
  onCancelEntryLoad: () => void
  setOpenButtonRef: (node: HTMLButtonElement | null) => void
}) {
  const { t } = useI18n()
  const formatEntryCount = (count: number) =>
    count === 1
      ? t('raw.lutSource.countOne')
      : count > 1
        ? t('raw.lutSource.countMany', { count })
        : t('raw.lutSource.countZero')
  const hasIssue = issues.length > 0

  return (
    <div className="grid min-w-0 gap-1" data-raw-lut="source-resource">
      <div
        className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
        data-raw-lut="source-resource-row"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate text-[0.78rem] font-medium text-lf-on-surface/85">
            {resource.label}
          </span>
          <span className="shrink-0 rounded-full bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.06)] px-1.5 py-0.5 text-[0.66rem] font-medium leading-none text-lf-on-surface/72 tabular-nums">
            {formatEntryCount(entries.length)}
          </span>
          {isLoading && (
            <span className="shrink-0 rounded-full bg-[oklch(from_var(--color-lf-green)_l_c_h_/_0.12)] px-1.5 py-0.5 text-[0.66rem] font-medium leading-none text-lf-green-deep">
              {t('raw.lutSource.loading')}
            </span>
          )}
          {hasIssue && (
            <span className="shrink-0 rounded-full bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.14)] px-1.5 py-0.5 text-[0.66rem] font-medium leading-none text-lf-on-surface/80">
              {t('raw.lutSource.issue')}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <LutIconButton
            label={t('raw.lutSource.open', {
              label: resource.label,
            })}
            ariaControls={browserId}
            ariaExpanded={isOpen}
            ariaHasPopup="dialog"
            buttonRef={setOpenButtonRef}
            onClick={isOpen ? onClose : onOpen}
          >
            <FolderOpen aria-hidden="true" />
          </LutIconButton>
          <LutIconButton
            label={t('raw.lutSource.refresh', {
              label: resource.label,
            })}
            busy={isLoading}
            onClick={onRefresh}
          >
            <RefreshCw aria-hidden="true" />
          </LutIconButton>
          <LutIconButton
            label={t('raw.lutSource.remove', {
              label: resource.label,
            })}
            onClick={onRemove}
          >
            <Trash2 aria-hidden="true" />
          </LutIconButton>
        </div>
      </div>
      <OnlineLutSourceInlineEntries
        entries={entries}
        loadingEntryId={loadingEntryId}
        failedEntryId={failedEntryId}
        entryLoadProgress={entryLoadProgress}
        browserId={browserId}
        onEntryLoad={onEntryLoad}
        onCancelEntryLoad={onCancelEntryLoad}
        onBrowseAll={onOpen}
      />
      <LutSourceWarning issues={issues} surface="on-photo" className="pt-1.5" />
    </div>
  )
}

function OnlineLutSourceInlineEntries({
  entries,
  loadingEntryId,
  failedEntryId,
  entryLoadProgress,
  browserId,
  onEntryLoad,
  onCancelEntryLoad,
  onBrowseAll,
}: {
  entries: OnlineLutEntry[]
  loadingEntryId: string | null
  failedEntryId: string | null
  entryLoadProgress: OnlineLutEntryLoadProgress | null
  browserId: string
  onEntryLoad: (entryId: string) => void
  onCancelEntryLoad: () => void
  onBrowseAll: () => void
}) {
  const { t } = useI18n()
  if (entries.length === 0) return null

  const anotherLoading = loadingEntryId !== null
  const overflow = entries.length - inlineEntryLimit

  return (
    <div className="grid min-w-0 gap-1">
      <div
        className="grid gap-1 sm:grid-cols-2"
        data-raw-lut="source-inline-entries"
      >
        {entries.slice(0, inlineEntryLimit).map((entry) => (
          <OnlineLutSourceInlineEntry
            key={entry.id}
            entry={entry}
            isLoading={loadingEntryId === entry.id}
            isLocked={anotherLoading && loadingEntryId !== entry.id}
            isFailed={failedEntryId === entry.id}
            progress={
              entryLoadProgress?.entryId === entry.id ? entryLoadProgress : null
            }
            onLoad={() => onEntryLoad(entry.id)}
            onCancel={onCancelEntryLoad}
          />
        ))}
      </div>
      {overflow > 0 && (
        <button
          type="button"
          aria-controls={browserId}
          onClick={onBrowseAll}
          className="justify-self-start rounded-md px-1.5 py-0.5 text-[0.7rem] font-medium text-lf-on-surface/60 transition-colors hover:text-lf-on-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green"
          data-raw-lut="source-inline-overflow"
        >
          {t('raw.lutSource.moreCount', { count: overflow })}
        </button>
      )}
    </div>
  )
}

export function entryLoadPercent(
  progress: OnlineLutEntryLoadProgress | null,
): number | null {
  if (!progress?.totalBytes) return null

  return Math.min(
    100,
    Math.round((progress.receivedBytes / progress.totalBytes) * 100),
  )
}

function OnlineLutSourceInlineEntry({
  entry,
  isLoading,
  isLocked,
  isFailed,
  progress,
  onLoad,
  onCancel,
}: {
  entry: OnlineLutEntry
  isLoading: boolean
  isLocked: boolean
  isFailed: boolean
  progress: OnlineLutEntryLoadProgress | null
  onLoad: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const percent = isLoading ? entryLoadPercent(progress) : null
  const metaLabel =
    isLoading && progress
      ? percent !== null
        ? `${percent}% · ${formatBytes(progress.receivedBytes)}`
        : formatBytes(progress.receivedBytes)
      : null

  return (
    <button
      type="button"
      aria-label={
        isLoading
          ? t('raw.lutSource.cancelDownload', { label: entry.title })
          : isFailed
            ? t('raw.lutSource.loadFailedRetry', { label: entry.title })
            : t('raw.lutSource.load', { label: entry.title })
      }
      aria-busy={isLoading || undefined}
      disabled={isLocked}
      onClick={isLoading ? onCancel : onLoad}
      data-raw-lut-entry-loading={isLoading ? 'true' : undefined}
      data-raw-lut-entry-failed={isFailed ? 'true' : undefined}
      className={[
        'relative grid min-h-9 min-w-0 grid-cols-[16px_minmax(0,1fr)_16px] items-center gap-1.5 overflow-hidden rounded-md bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.035)] px-1.5 py-1 text-left text-[0.72rem] font-medium text-lf-on-surface/74 transition-colors hover:bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.065)] hover:text-lf-on-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green',
        isLocked
          ? 'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.035)] disabled:hover:text-lf-on-surface/74'
          : '',
        isFailed
          ? 'bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.08)] hover:bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.12)]'
          : '',
      ].join(' ')}
    >
      <Aperture aria-hidden="true" className="size-4 text-lf-on-surface/40" />
      <span className="grid min-w-0 gap-0.5">
        <span className="min-w-0 truncate">{entry.title}</span>
        {metaLabel && (
          <span className="min-w-0 truncate text-[0.62rem] font-normal text-lf-on-surface/45 tabular-nums">
            {metaLabel}
          </span>
        )}
      </span>
      {isLoading ? (
        <X aria-hidden="true" className="size-3.5" />
      ) : isFailed ? (
        <TriangleAlert aria-hidden="true" className="size-3.5 text-lf-amber" />
      ) : (
        <Download aria-hidden="true" className="size-3.5" />
      )}
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
    </button>
  )
}
