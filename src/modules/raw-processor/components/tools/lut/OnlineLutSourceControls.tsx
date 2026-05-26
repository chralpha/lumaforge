import {
  AlertTriangle,
  Download,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Chip } from '~/components/ui/chip'
import { Input } from '~/components/ui/input'
import { useScrollEdgeFade } from '~/hooks/common'
import { useI18n } from '~/lib/i18n'

import type { UseOnlineLutSourcesResult } from '../../../hooks/useOnlineLutSources'
import { groupEntriesByFamily } from './lut-source-grouping'
import { LutBrowserDialog } from './LutBrowserDialog'
import { LutIconButton } from './LutIconButton'

type OnlineLutSourceEntries = UseOnlineLutSourcesResult['state']['entries']
type OnlineLutSourceIssues = UseOnlineLutSourcesResult['state']['issues']

export function OnlineLutSourceControls({
  onlineLutSources,
}: {
  onlineLutSources: UseOnlineLutSourcesResult
}) {
  const { t } = useI18n()
  const sourceInputId = useId()
  const browserId = useId()
  const { state } = onlineLutSources
  const [openResourceId, setOpenResourceId] = useState<string | null>(null)
  const [loadingEntryId, setLoadingEntryId] = useState<string | null>(null)
  const [browserListEl, setBrowserListEl] = useState<HTMLDivElement | null>(
    null,
  )
  useScrollEdgeFade(browserListEl, { enabled: openResourceId != null })
  const openButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const resourcesById = useMemo(
    () => new Map(state.resources.map((resource) => [resource.id, resource])),
    [state.resources],
  )
  const entriesByResourceId = useMemo(() => {
    const entries = new Map<string, OnlineLutSourceEntries>()

    for (const resource of state.resources) {
      entries.set(resource.id, [])
    }

    for (const entry of state.entries) {
      entries.set(entry.resourceId, [
        ...(entries.get(entry.resourceId) ?? []),
        entry,
      ])
    }

    return entries
  }, [state.entries, state.resources])
  const issuesByResourceId = useMemo(() => {
    const issues = new Map<string, OnlineLutSourceIssues>()

    for (const issue of state.issues) {
      if (!issue.resourceId) continue

      issues.set(issue.resourceId, [
        ...(issues.get(issue.resourceId) ?? []),
        issue,
      ])
    }

    return issues
  }, [state.issues])
  const openResource = openResourceId
    ? resourcesById.get(openResourceId)
    : undefined
  const openEntries = openResourceId
    ? (entriesByResourceId.get(openResourceId) ?? [])
    : []
  const openIssues = openResourceId
    ? (issuesByResourceId.get(openResourceId) ?? [])
    : []
  const closeBrowser = useCallback(
    (resourceId = openResourceId, options: { restoreFocus?: boolean } = {}) => {
      setOpenResourceId(null)

      if (options.restoreFocus && resourceId) {
        queueMicrotask(() => openButtonRefs.current.get(resourceId)?.focus())
      }
    },
    [openResourceId],
  )
  const openBrowserForResource = useCallback((resourceId: string) => {
    setOpenResourceId(resourceId)
  }, [])

  useEffect(() => {
    if (!openResourceId) return

    if (!resourcesById.has(openResourceId)) {
      closeBrowser(openResourceId)
    }
  }, [closeBrowser, openResourceId, resourcesById])

  const formatEntryCount = (count: number) =>
    count === 1
      ? t('raw.lutSource.countOne')
      : count > 1
        ? t('raw.lutSource.countMany', { count })
        : t('raw.lutSource.countZero')
  const openBrowser =
    openResource &&
    (() => {
      return (
        <LutBrowserDialog
          open={Boolean(openResource)}
          id={browserId}
          kind="source"
          className="grid-rows-[auto_minmax(0,1fr)]"
          dialogLabel={`${openResource.label} LUTs`}
          title={openResource.label}
          description={formatEntryCount(openEntries.length)}
          closeLabel={t('raw.lutSource.close')}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              closeBrowser(openResource.id, { restoreFocus: true })
            }
          }}
        >
          <div
            ref={setBrowserListEl}
            className="grid min-h-0 content-start gap-2 overflow-y-auto overscroll-contain pr-0.5"
            data-raw-lut="source-browser-list"
            data-lut-source-scroll="internal"
          >
            {openEntries.length > 0 ? (
              (() => {
                const { families, others } = groupEntriesByFamily(openEntries)

                const renderEntry = (entry: (typeof openEntries)[number]) => {
                  const isLoading = loadingEntryId === entry.id
                  const handleLoadEntry = async () => {
                    if (loadingEntryId) return
                    setLoadingEntryId(entry.id)
                    await new Promise<void>((resolve) =>
                      requestAnimationFrame(() => resolve()),
                    )
                    try {
                      await onlineLutSources.loadEntry(entry.id)
                      closeBrowser(openResource.id, { restoreFocus: true })
                    } catch {
                      // per-resource issue chip surfaces the failure
                    } finally {
                      setLoadingEntryId(null)
                    }
                  }

                  return (
                    <div
                      key={entry.id}
                      className="grid min-w-0 grid-cols-[minmax(0,1fr)_28px] items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.045)]"
                      data-raw-lut="source-entry"
                      data-raw-lut-entry-loading={
                        isLoading ? 'true' : undefined
                      }
                    >
                      <span className="min-w-0 truncate text-[0.74rem] leading-[1.35] text-lf-ink/75">
                        {entry.title}
                      </span>
                      <LutIconButton
                        label={t('raw.lutSource.load', {
                          label: entry.title,
                        })}
                        busy={isLoading}
                        disabled={isLoading}
                        onClick={() => {
                          void handleLoadEntry()
                        }}
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

                return (
                  <>
                    {families.map(({ family, items }) => (
                      <div key={family} className="grid gap-1">
                        <div className="px-1 text-[0.7rem] font-medium tracking-tight text-lf-ink/50">
                          {family}
                        </div>
                        <div className="grid gap-0.5 sm:grid-cols-2">
                          {items.map(renderEntry)}
                        </div>
                      </div>
                    ))}
                    {others.length > 0 && (
                      <div className="grid gap-1">
                        <div className="px-1 text-[0.7rem] font-medium tracking-tight text-lf-ink/50">
                          {t('raw.lutSource.others')}
                        </div>
                        <div className="grid gap-0.5 sm:grid-cols-2">
                          {others.map(renderEntry)}
                        </div>
                      </div>
                    )}
                  </>
                )
              })()
            ) : (
              <p className="text-[0.78rem] leading-relaxed text-lf-ink/55">
                {openIssues.length > 0
                  ? t('raw.lutSource.noneCompatible')
                  : t('raw.lutSource.noneYet')}
              </p>
            )}
          </div>
        </LutBrowserDialog>
      )
    })()

  return (
    <div className="grid min-w-0 gap-2 pt-1" data-raw-lut="source-controls">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_32px_32px] gap-1.5">
        <label htmlFor={sourceInputId} className="sr-only">
          {t('raw.lutSource.url')}
        </label>
        <Input
          id={sourceInputId}
          type="url"
          value={onlineLutSources.sourceUrlInput}
          placeholder="https://.../catalog.json"
          onChange={(event) =>
            onlineLutSources.setSourceUrlInput(event.currentTarget.value)
          }
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              onlineLutSources.sourceUrlInput.trim()
            ) {
              event.preventDefault()
              void onlineLutSources.addSourceFromInput()
            }
          }}
          inputClassName="h-8 rounded-md border-transparent bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.04)] text-[0.78rem] text-lf-ink shadow-none placeholder:text-lf-ink/40 focus:border-transparent focus:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.06)] focus:ring-2 focus:ring-lf-green/25"
        />
        <LutIconButton
          label={t('raw.lutSource.add')}
          disabled={!onlineLutSources.sourceUrlInput.trim()}
          onClick={() => void onlineLutSources.addSourceFromInput()}
        >
          <Plus aria-hidden="true" />
        </LutIconButton>
        <LutIconButton
          label={t('raw.lutSource.copy')}
          disabled={!onlineLutSources.share.enabled}
          onClick={() => {
            onlineLutSources.share.copy().then(
              () => toast.success(t('raw.lutSource.copied')),
              () => toast.error(t('raw.lutSource.copyFailed')),
            )
          }}
        >
          <Share2 aria-hidden="true" />
        </LutIconButton>
      </div>

      {state.resources.length === 0 && (
        <p className="m-0 text-[0.72rem] leading-relaxed text-lf-ink/55">
          {t('raw.lutSource.emptyHint')}
        </p>
      )}

      {state.resources.length > 0 && (
        <div className="grid min-w-0 gap-1.5">
          {state.resources.map((resource) => {
            const isResourceLoading =
              state.isLoading && state.activeResourceId === resource.id
            const entries = entriesByResourceId.get(resource.id) ?? []
            const hasIssue =
              (issuesByResourceId.get(resource.id) ?? []).length > 0
            const isOpen = openResourceId === resource.id

            return (
              <div
                key={resource.id}
                className="grid min-w-0 gap-1"
                data-raw-lut="source-resource"
              >
                <div
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                  data-raw-lut="source-resource-row"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="min-w-0 truncate text-[0.78rem] font-medium text-lf-ink/85">
                      {resource.label}
                    </span>
                    <span className="shrink-0 rounded-full bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.06)] px-1.5 py-0.5 text-[0.66rem] font-medium leading-none text-lf-ink/55 tabular-nums">
                      {formatEntryCount(entries.length)}
                    </span>
                    {isResourceLoading && (
                      <span className="shrink-0 rounded-full bg-[oklch(from_var(--color-lf-green)_l_c_h_/_0.12)] px-1.5 py-0.5 text-[0.66rem] font-medium leading-none text-lf-green-deep">
                        {t('raw.lutSource.loading')}
                      </span>
                    )}
                    {hasIssue && (
                      <span className="shrink-0 rounded-full bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.14)] px-1.5 py-0.5 text-[0.66rem] font-medium leading-none text-lf-ink/80">
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
                      buttonRef={(node) => {
                        if (node) {
                          openButtonRefs.current.set(resource.id, node)
                        } else {
                          openButtonRefs.current.delete(resource.id)
                        }
                      }}
                      onClick={() =>
                        isOpen
                          ? closeBrowser(resource.id, { restoreFocus: true })
                          : openBrowserForResource(resource.id)
                      }
                    >
                      <FolderOpen aria-hidden="true" />
                    </LutIconButton>
                    <LutIconButton
                      label={t('raw.lutSource.refresh', {
                        label: resource.label,
                      })}
                      busy={isResourceLoading}
                      onClick={() =>
                        void onlineLutSources.refreshSource(resource.id)
                      }
                    >
                      <RefreshCw aria-hidden="true" />
                    </LutIconButton>
                    <LutIconButton
                      label={t('raw.lutSource.remove', {
                        label: resource.label,
                      })}
                      onClick={() => {
                        if (isOpen) closeBrowser(resource.id)
                        onlineLutSources.removeSource(resource.id)
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </LutIconButton>
                  </div>
                </div>
                {(issuesByResourceId.get(resource.id) ?? []).length > 0 && (
                  <ul
                    className="m-0 grid list-none gap-1 p-0 pt-1.5"
                    role="status"
                    aria-live="polite"
                  >
                    {(issuesByResourceId.get(resource.id) ?? []).map(
                      (issue, index) => (
                        <li
                          key={[
                            issue.code,
                            issue.entryId ??
                              issue.sourceUrl ??
                              issue.raw ??
                              'resource',
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
                            <AlertTriangle
                              aria-hidden="true"
                              className="size-3 shrink-0"
                            />
                            <span className="min-w-0 truncate">
                              {issue.message}
                            </span>
                          </Chip>
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      {openBrowser}

      {(() => {
        const looseIssues = state.issues.filter((issue) => !issue.resourceId)
        if (looseIssues.length === 0) return null

        return (
          <div
            className="grid gap-1 text-lf-label leading-relaxed text-lf-ink-soft"
            role="status"
            aria-live="polite"
          >
            {looseIssues.slice(-2).map((issue, index) => (
              <p
                key={[
                  issue.code,
                  issue.raw ?? issue.sourceUrl ?? issue.message,
                  index,
                ].join(':')}
                className="m-0"
              >
                {issue.message}
              </p>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
