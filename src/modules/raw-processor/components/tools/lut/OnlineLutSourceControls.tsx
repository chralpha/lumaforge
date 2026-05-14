import {
  Download,
  FolderOpen,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Input } from '~/components/ui/input'
import { useI18n } from '~/lib/i18n'

import type { UseOnlineLutSourcesResult } from '../../../hooks/useOnlineLutSources'
import type { OnlineLutBrowserLayout } from './lut-browser-layout'
import { getViewportBoundedBrowserLayout } from './lut-browser-layout'
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
  const [browserLayout, setBrowserLayout] =
    useState<OnlineLutBrowserLayout | null>(null)
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
      setBrowserLayout(null)

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
    const scrollTargets = [
      trigger?.closest('.raw-tool-stack'),
      trigger?.closest('.raw-tool-surface'),
    ].filter((target): target is Element => target instanceof Element)

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
  const openBrowser =
    openResource &&
    browserLayout &&
    (() => {
      return (
        <LutBrowserDialog
          open={Boolean(openResource)}
          layout={browserLayout}
          id={browserId}
          kind="source"
          className="raw-lut-source-browser"
          headingClassName="raw-lut-source-browser-heading"
          dialogLabel={`${openResource.label} LUTs`}
          title={openResource.label}
          description={formatEntryCount(openEntries.length)}
          closeLabel={t('raw.lutSource.close')}
          restoreFocus={() =>
            openButtonRefs.current.get(openResource.id)?.focus()
          }
          triggerElement={openButtonRefs.current.get(openResource.id)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              closeBrowser(openResource.id, { restoreFocus: true })
            }
          }}
        >
          <div
            className="raw-lut-browser-list raw-lut-source-browser-list"
            data-lut-source-scroll="internal"
          >
            {openEntries.length > 0 ? (
              (() => {
                const familyGroups = new Map<string, typeof openEntries>()
                const ungrouped: typeof openEntries = []

                for (const entry of openEntries) {
                  if (entry.family) {
                    const group = familyGroups.get(entry.family)
                    if (group) {
                      group.push(entry)
                    } else {
                      familyGroups.set(entry.family, [entry])
                    }
                  } else {
                    ungrouped.push(entry)
                  }
                }

                const renderEntry = (entry: (typeof openEntries)[number]) => (
                  <div key={entry.id} className="raw-lut-source-entry">
                    <span className="raw-lut-source-entry-title">
                      {entry.title}
                    </span>
                    <LutIconButton
                      label={t('raw.lutSource.load', { label: entry.title })}
                      onClick={() => void onlineLutSources.loadEntry(entry.id)}
                    >
                      <Download aria-hidden="true" />
                    </LutIconButton>
                  </div>
                )

                return (
                  <>
                    {Array.from(familyGroups, ([family, entries]) => (
                      <div key={family} className="raw-lut-source-family-group">
                        <div className="raw-lut-source-family-heading">
                          {family}
                        </div>
                        {entries.map(renderEntry)}
                      </div>
                    ))}
                    {ungrouped.length > 0 && (
                      <div className="raw-lut-source-family-group">
                        <div className="raw-lut-source-family-heading">
                          {t('raw.lutSource.others')}
                        </div>
                        {ungrouped.map(renderEntry)}
                      </div>
                    )}
                  </>
                )
              })()
            ) : (
              <p className="raw-lut-source-browser-empty">
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
    <div className="raw-lut-source-controls">
      <div className="raw-lut-source-input-row">
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
          inputClassName="raw-lut-input h-8 text-xs"
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
          onClick={() => void onlineLutSources.share.copy()}
        >
          <Share2 aria-hidden="true" />
        </LutIconButton>
      </div>

      {state.resources.length > 0 && (
        <div className="raw-lut-source-list">
          {state.resources.map((resource) => {
            const isResourceLoading =
              state.isLoading && state.activeResourceId === resource.id
            const entries = entriesByResourceId.get(resource.id) ?? []
            const hasIssue =
              (issuesByResourceId.get(resource.id) ?? []).length > 0
            const isOpen = openResourceId === resource.id

            return (
              <div key={resource.id} className="raw-lut-source-resource">
                <div className="raw-lut-source-resource-row">
                  <div className="raw-lut-source-summary">
                    <span className="raw-lut-source-label">
                      {resource.label}
                    </span>
                    <span className="raw-lut-source-count">
                      {formatEntryCount(entries.length)}
                    </span>
                    {isResourceLoading && (
                      <span className="raw-lut-source-state">
                        {t('raw.lutSource.loading')}
                      </span>
                    )}
                    {hasIssue && (
                      <span className="raw-lut-source-state raw-lut-source-state-issue">
                        {t('raw.lutSource.issue')}
                      </span>
                    )}
                  </div>
                  <div className="raw-lut-source-actions">
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
              </div>
            )
          })}
        </div>
      )}

      {openBrowser}

      {state.issues.length > 0 && (
        <div className="raw-lut-source-issues" role="status" aria-live="polite">
          {state.issues.slice(-2).map((issue, index) => (
            <p
              key={[
                issue.code,
                issue.resourceId ?? issue.raw ?? 'source',
                issue.entryId ?? issue.sourceUrl ?? issue.message,
                index,
              ].join(':')}
            >
              {issue.message}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
