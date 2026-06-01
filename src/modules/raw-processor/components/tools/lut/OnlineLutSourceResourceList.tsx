import { AlertTriangle, FolderOpen, RefreshCw, Trash2 } from 'lucide-react'

import { Chip } from '~/components/ui/chip'
import { useI18n } from '~/lib/i18n'

import type { UseOnlineLutSourcesResult } from '../../../hooks/useOnlineLutSources'
import { LutIconButton } from './LutIconButton'

type OnlineLutResource = UseOnlineLutSourcesResult['state']['resources'][number]
type OnlineLutEntry = UseOnlineLutSourcesResult['state']['entries'][number]
type OnlineLutIssue = UseOnlineLutSourcesResult['state']['issues'][number]

export function OnlineLutSourceResourceList({
  resources,
  isLoading,
  activeResourceId,
  entriesByResourceId,
  issuesByResourceId,
  openResourceId,
  browserId,
  onOpenResource,
  onCloseResource,
  onRefreshResource,
  onRemoveResource,
  setOpenButtonRef,
}: {
  resources: OnlineLutResource[]
  isLoading: boolean
  activeResourceId: string | null
  entriesByResourceId: ReadonlyMap<string, OnlineLutEntry[]>
  issuesByResourceId: ReadonlyMap<string, OnlineLutIssue[]>
  openResourceId: string | null
  browserId: string
  onOpenResource: (resourceId: string) => void
  onCloseResource: (resourceId: string) => void
  onRefreshResource: (resourceId: string) => void
  onRemoveResource: (resourceId: string) => void
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
          browserId={browserId}
          onOpen={() => onOpenResource(resource.id)}
          onClose={() => onCloseResource(resource.id)}
          onRefresh={() => onRefreshResource(resource.id)}
          onRemove={() => onRemoveResource(resource.id)}
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
  browserId,
  onOpen,
  onClose,
  onRefresh,
  onRemove,
  setOpenButtonRef,
}: {
  resource: OnlineLutResource
  isLoading: boolean
  entries: OnlineLutEntry[]
  issues: OnlineLutIssue[]
  isOpen: boolean
  browserId: string
  onOpen: () => void
  onClose: () => void
  onRefresh: () => void
  onRemove: () => void
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
      {issues.length > 0 && <OnlineLutSourceIssues issues={issues} />}
    </div>
  )
}

function OnlineLutSourceIssues({ issues }: { issues: OnlineLutIssue[] }) {
  return (
    <ul
      className="m-0 grid list-none gap-1 p-0 pt-1.5"
      role="status"
      aria-live="polite"
    >
      {issues.map((issue, index) => (
        <li
          key={[
            issue.code,
            issue.entryId ?? issue.sourceUrl ?? issue.raw ?? 'resource',
            index,
          ].join(':')}
          className="m-0"
        >
          <Chip
            tone="amber"
            surface="paper"
            size="sm"
            className="max-w-full normal-case tracking-normal"
          >
            <AlertTriangle aria-hidden="true" className="size-3 shrink-0" />
            <span className="min-w-0 truncate">{issue.message}</span>
          </Chip>
        </li>
      ))}
    </ul>
  )
}
