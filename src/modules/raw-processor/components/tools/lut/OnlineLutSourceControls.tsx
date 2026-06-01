import {
  AlertTriangle,
  FolderOpen,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
} from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'

import { Chip } from '~/components/ui/chip'
import { Input } from '~/components/ui/input'
import { useScrollEdgeFade } from '~/hooks/common'
import { useI18n } from '~/lib/i18n'

import type { UseOnlineLutSourcesResult } from '../../../hooks/useOnlineLutSources'
import type { OnlineLutBrowserLayout } from './lut-browser-layout'
import { getViewportBoundedBrowserLayout } from './lut-browser-layout'
import { LutIconButton } from './LutIconButton'
import { OnlineLutSourceBrowser } from './OnlineLutSourceBrowser'
import { useOnlineLutEntryLoader } from './useOnlineLutEntryLoader'
import { useOnlineLutResourceState } from './useOnlineLutResourceState'

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
  const [browserLayout, setBrowserLayout] =
    useState<OnlineLutBrowserLayout | null>(null)
  const [browserListEl, setBrowserListEl] = useState<HTMLDivElement | null>(
    null,
  )
  useScrollEdgeFade(browserListEl, { enabled: openResourceId != null })
  const openButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const { loadingEntryId, loadOnlineLutEntry } = useOnlineLutEntryLoader(
    onlineLutSources.loadEntry,
  )
  const {
    resourcesById,
    entriesByResourceId,
    issuesByResourceId,
    selectedResource: openResource,
    selectedEntries: openEntries,
    selectedIssues: openIssues,
  } = useOnlineLutResourceState({ state, resourceId: openResourceId })
  const closeBrowser = useCallback(
    (resourceId = openResourceId, options: { restoreFocus?: boolean } = {}) => {
      setOpenResourceId(null)
      // Layout is left in place so the dialog's exit animation can finish
      // against the same anchor before the next open recomputes it.

      if (options.restoreFocus && resourceId) {
        queueMicrotask(() => openButtonRefs.current.get(resourceId)?.focus())
      }
    },
    [openResourceId],
  )
  const openBrowserForResource = useCallback((resourceId: string) => {
    const trigger = openButtonRefs.current.get(resourceId)
    if (!trigger) return

    setBrowserLayout(getViewportBoundedBrowserLayout(trigger))
    setOpenResourceId(resourceId)
  }, [])
  const updateBrowserLayout = useCallback(() => {
    if (!openResourceId) return

    setBrowserLayout(
      getViewportBoundedBrowserLayout(
        openButtonRefs.current.get(openResourceId),
      ),
    )
  }, [openResourceId])

  useEffect(() => {
    if (!openResourceId) return

    if (!resourcesById.has(openResourceId)) {
      closeBrowser(openResourceId)
    }
  }, [closeBrowser, openResourceId, resourcesById])

  useLayoutEffect(() => {
    updateBrowserLayout()
  }, [updateBrowserLayout, openEntries.length, openIssues.length])

  useEffect(() => {
    if (!openResourceId) return

    const handleViewportChange = () => {
      updateBrowserLayout()
    }
    const trigger = openButtonRefs.current.get(openResourceId)
    const scrollTargets = [trigger?.closest('.raw-tool-surface')].filter(
      (target): target is Element => target instanceof Element,
    )

    window.addEventListener('resize', handleViewportChange)
    for (const target of scrollTargets) {
      target.addEventListener('scroll', handleViewportChange)
    }

    return () => {
      window.removeEventListener('resize', handleViewportChange)
      for (const target of scrollTargets) {
        target.removeEventListener('scroll', handleViewportChange)
      }
    }
  }, [openResourceId, updateBrowserLayout])

  const formatEntryCount = (count: number) =>
    count === 1
      ? t('raw.lutSource.countOne')
      : count > 1
        ? t('raw.lutSource.countMany', { count })
        : t('raw.lutSource.countZero')
  const dialogResource = openResource
  const openBrowser = dialogResource && browserLayout && (
    <OnlineLutSourceBrowser
      id={browserId}
      resource={dialogResource}
      entries={openEntries}
      issues={openIssues}
      layout={browserLayout}
      loadingEntryId={loadingEntryId}
      listRef={setBrowserListEl}
      restoreFocus={() =>
        openButtonRefs.current.get(dialogResource.id)?.focus()
      }
      triggerElement={openButtonRefs.current.get(dialogResource.id)}
      passthroughElements={() => openButtonRefs.current.values()}
      onClose={() => closeBrowser(dialogResource.id, { restoreFocus: true })}
      onEntryLoad={(entryId) => {
        void loadOnlineLutEntry(entryId, () =>
          closeBrowser(dialogResource.id, { restoreFocus: true }),
        )
      }}
    />
  )

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
          inputClassName="h-8 rounded-md border-transparent bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.04)] text-[0.78rem] text-lf-on-surface shadow-none placeholder:text-lf-on-surface/40 focus:border-transparent focus:bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.06)] focus:ring-2 focus:ring-lf-green/25"
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
        <p className="m-0 text-[0.72rem] leading-relaxed text-lf-on-surface/72">
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
                    <span className="min-w-0 truncate text-[0.78rem] font-medium text-lf-on-surface/85">
                      {resource.label}
                    </span>
                    <span className="shrink-0 rounded-full bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.06)] px-1.5 py-0.5 text-[0.66rem] font-medium leading-none text-lf-on-surface/72 tabular-nums">
                      {formatEntryCount(entries.length)}
                    </span>
                    {isResourceLoading && (
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

      <AnimatePresence>{openBrowser}</AnimatePresence>

      {(() => {
        const looseIssues = state.issues.filter((issue) => !issue.resourceId)
        if (looseIssues.length === 0) return null

        return (
          <div
            className="grid gap-1 text-lf-label leading-relaxed text-lf-on-surface-soft"
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
