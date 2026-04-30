import {
  Download,
  FolderOpen,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  X,
} from 'lucide-react'
import type { CSSProperties, ReactNode, Ref } from 'react'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import type { LUTColorProfile } from '~/lib/color/registry'
import { searchLUTColorProfiles } from '~/lib/color/registry'
import type { LUTProfileResolution } from '~/lib/gl/pipeline'

import type { UseOnlineLutSourcesResult } from '../../hooks/useOnlineLutSources'
import type { LUTProfileSelectionState } from '../../model/session'
import { LutDropzone } from '../Dropzone'
import {
  getProfileContractLabel,
  getProfileOutputLabel,
  getResolvedProfile,
  groupProfiles,
  toSelectableContract,
} from './lut-contract'
import { ToolSection } from './ToolSection'

const UNKNOWN_LUT_COPY =
  'Choose the LUT input and output contract before preview or export.'

type OnlineLutSourceEntries = UseOnlineLutSourcesResult['state']['entries']
type OnlineLutSourceIssues = UseOnlineLutSourcesResult['state']['issues']

type OnlineLutBrowserPlacement = 'anchored' | 'docked' | 'sheet'

type OnlineLutBrowserLayout = {
  placement: OnlineLutBrowserPlacement
  top?: number
  left?: number
  width?: number
  maxHeight?: number
}

type OnlineLutBrowserStyle = CSSProperties & {
  '--raw-lut-source-browser-top'?: string
  '--raw-lut-source-browser-left'?: string
  '--raw-lut-source-browser-width'?: string
  '--raw-lut-source-browser-max-height'?: string
}

const LUT_BROWSER_VIEWPORT_MARGIN = 12
const LUT_BROWSER_TRIGGER_GAP = 8
const LUT_BROWSER_MIN_WIDTH = 320
const LUT_BROWSER_MAX_WIDTH = 420
const LUT_BROWSER_MIN_HEIGHT = 184
const LUT_BROWSER_MAX_HEIGHT = 420

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getViewportBoundedBrowserLayout(
  trigger: HTMLButtonElement | undefined,
): OnlineLutBrowserLayout {
  if (typeof window === 'undefined' || !trigger) {
    return { placement: 'anchored' }
  }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const margin = LUT_BROWSER_VIEWPORT_MARGIN

  if (viewportWidth <= 720) {
    return { placement: 'sheet' }
  }

  const triggerRect = trigger.getBoundingClientRect()
  const rowRect =
    trigger.closest('.raw-lut-source-resource-row')?.getBoundingClientRect() ??
    triggerRect
  const availableWidth = Math.max(0, viewportWidth - margin * 2)
  const width = Math.min(
    LUT_BROWSER_MAX_WIDTH,
    Math.max(LUT_BROWSER_MIN_WIDTH, Math.min(rowRect.width, availableWidth)),
    availableWidth,
  )
  const left = clampNumber(
    rowRect.right - width,
    margin,
    viewportWidth - margin - width,
  )
  const viewportBoundedHeight = Math.max(
    LUT_BROWSER_MIN_HEIGHT,
    viewportHeight - margin * 2,
  )

  if (viewportHeight <= 520) {
    return {
      placement: 'docked',
      top: margin,
      left,
      width,
      maxHeight: viewportBoundedHeight,
    }
  }

  const availableBelow =
    viewportHeight - triggerRect.bottom - margin - LUT_BROWSER_TRIGGER_GAP
  const availableAbove = triggerRect.top - margin - LUT_BROWSER_TRIGGER_GAP
  const placeBelow = availableBelow >= availableAbove
  const maxHeight = clampNumber(
    placeBelow ? availableBelow : availableAbove,
    LUT_BROWSER_MIN_HEIGHT,
    Math.min(LUT_BROWSER_MAX_HEIGHT, viewportBoundedHeight),
  )
  const preferredTop = placeBelow
    ? triggerRect.bottom + LUT_BROWSER_TRIGGER_GAP
    : triggerRect.top - LUT_BROWSER_TRIGGER_GAP - maxHeight

  return {
    placement: 'anchored',
    top: clampNumber(preferredTop, margin, viewportHeight - margin - maxHeight),
    left,
    width,
    maxHeight,
  }
}

function toBrowserStyle(
  layout: OnlineLutBrowserLayout | null,
): OnlineLutBrowserStyle | undefined {
  if (!layout || layout.placement === 'sheet') return undefined

  return {
    '--raw-lut-source-browser-top': `${layout.top}px`,
    '--raw-lut-source-browser-left': `${layout.left}px`,
    '--raw-lut-source-browser-width': `${layout.width}px`,
    '--raw-lut-source-browser-max-height': `${layout.maxHeight}px`,
  }
}

function LUTProfileButton({
  profile,
  activeProfileId,
  onSelect,
  highlighted = false,
}: {
  profile: LUTColorProfile
  activeProfileId?: string
  onSelect: (profile: LUTColorProfile) => void
  highlighted?: boolean
}) {
  const isActive = activeProfileId === profile.id
  const label = getProfileContractLabel(profile)

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isActive}
      onClick={() => onSelect(profile)}
      className={
        isActive
          ? 'w-full rounded-md border border-accent bg-accent/10 px-2.5 py-2 text-left text-xs leading-snug text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
          : highlighted
            ? 'w-full rounded-md border border-accent/40 bg-fill px-2.5 py-2 text-left text-xs leading-snug text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
            : 'w-full rounded-md border border-border bg-background px-2.5 py-2 text-left text-xs leading-snug text-text-secondary transition-colors hover:border-accent/40 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
      }
    >
      <span className="block min-w-0 break-words">{label}</span>
    </button>
  )
}

function LUTProfileSelector({
  suggestions,
  activeProfileId,
  onSelect,
}: {
  suggestions: LUTColorProfile[]
  activeProfileId?: string
  onSelect: (profile: LUTColorProfile) => void
}) {
  const searchInputId = useId()
  const [query, setQuery] = useState('')
  const searchResults = useMemo(() => searchLUTColorProfiles(query), [query])
  const resultIds = useMemo(
    () => new Set(searchResults.map((profile) => profile.id)),
    [searchResults],
  )
  const visibleSuggestions = useMemo(
    () =>
      suggestions
        .map(toSelectableContract)
        .filter((profile): profile is LUTColorProfile => Boolean(profile))
        .filter(
          (profile, index, items) =>
            resultIds.has(profile.id) &&
            items.findIndex((item) => item.id === profile.id) === index,
        ),
    [resultIds, suggestions],
  )
  const suggestionIds = useMemo(
    () => new Set(visibleSuggestions.map((profile) => profile.id)),
    [visibleSuggestions],
  )
  const groupedProfiles = useMemo(
    () =>
      groupProfiles(
        searchResults
          .map(toSelectableContract)
          .filter((profile): profile is LUTColorProfile => Boolean(profile))
          .filter((profile) => !suggestionIds.has(profile.id)),
      ),
    [searchResults, suggestionIds],
  )
  const hasMatches = visibleSuggestions.length > 0 || groupedProfiles.length > 0

  return (
    <div className="space-y-2 pt-1">
      <label htmlFor={searchInputId} className="sr-only">
        Search LUT contract
      </label>
      <Input
        id={searchInputId}
        type="search"
        value={query}
        placeholder="Search camera/log or output"
        onChange={(event) => setQuery(event.currentTarget.value)}
        inputClassName="h-8 text-xs"
      />

      <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
        {visibleSuggestions.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase text-text-tertiary">
              Suggested
            </p>
            <div className="space-y-1">
              {visibleSuggestions.map((profile) => (
                <LUTProfileButton
                  key={profile.id}
                  profile={profile}
                  activeProfileId={activeProfileId}
                  onSelect={onSelect}
                  highlighted
                />
              ))}
            </div>
          </div>
        )}

        {groupedProfiles.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="text-[11px] font-medium uppercase text-text-tertiary">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((profile) => (
                <LUTProfileButton
                  key={profile.id}
                  profile={profile}
                  activeProfileId={activeProfileId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        ))}

        {!hasMatches && (
          <p className="text-xs text-text-tertiary">
            No matching LUT contract.
          </p>
        )}
      </div>
    </div>
  )
}

function LUTProfileStatus({
  selection,
  resolution,
  onSelect,
}: {
  selection?: LUTProfileSelectionState | null
  resolution?: LUTProfileResolution | null
  onSelect: (profile: LUTColorProfile) => void
}) {
  const resolvedProfile = getResolvedProfile(selection, resolution)
  const outputLabel = getProfileOutputLabel(resolvedProfile)
  const needsOutputContract = outputLabel === 'Output profile required'
  const isPending = selection?.status === 'pending'
  const isUnsupportedOutput =
    resolution?.kind === 'needs-user-selection' &&
    resolution.reason === 'unsupported-output'
  const suggestions =
    selection?.status === 'pending' ? selection.suggestions : []
  const activeProfileId =
    selection?.status === 'resolved' ? selection.profileId : resolvedProfile?.id
  const [selectorOpen, setSelectorOpen] = useState(
    !isUnsupportedOutput && isPending,
  )
  const showSelector = !isUnsupportedOutput && selectorOpen
  const handleSelect = (profile: LUTColorProfile) => {
    onSelect(profile)
    setSelectorOpen(false)
  }

  if (!selection && !resolution) return null

  return (
    <div className="space-y-2 pt-1">
      {isUnsupportedOutput ? (
        <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs leading-relaxed text-text-secondary">
          This LUT output is not supported yet. Use a Rec.709 display LUT for
          this build.
        </p>
      ) : isPending ? (
        <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs leading-relaxed text-text-secondary">
          {UNKNOWN_LUT_COPY}
        </p>
      ) : resolvedProfile ? (
        <div className="space-y-1.5 text-xs leading-relaxed">
          <p className="grid grid-cols-[4.7rem_minmax(0,1fr)] gap-2">
            <span className="text-text-tertiary">LUT input:</span>
            <span className="min-w-0 break-words text-text">
              {resolvedProfile.label}
            </span>
          </p>
          {outputLabel && (
            <p className="grid grid-cols-[4.7rem_minmax(0,1fr)] gap-2">
              <span className="text-text-tertiary">LUT output:</span>
              <span className="min-w-0 break-words text-text">
                {outputLabel}
              </span>
            </p>
          )}
          {needsOutputContract && (
            <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs leading-relaxed text-text-secondary">
              Choose the LUT output before preview or export.
            </p>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSelectorOpen((value) => !value)}
            className="mt-1"
          >
            Change LUT contract
          </Button>
        </div>
      ) : null}

      {showSelector && (
        <LUTProfileSelector
          suggestions={suggestions}
          activeProfileId={activeProfileId}
          onSelect={handleSelect}
        />
      )}
    </div>
  )
}

function LutIconButton({
  label,
  busy,
  disabled,
  ariaControls,
  ariaExpanded,
  ariaHasPopup,
  buttonRef,
  onClick,
  children,
}: {
  label: string
  busy?: boolean
  disabled?: boolean
  ariaControls?: string
  ariaExpanded?: boolean
  ariaHasPopup?: 'dialog'
  buttonRef?: Ref<HTMLButtonElement>
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-busy={busy || undefined}
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={
        busy
          ? 'raw-lut-source-icon-button raw-lut-source-icon-button-busy'
          : 'raw-lut-source-icon-button'
      }
    >
      {children}
    </button>
  )
}

function OnlineLutSourceControls({
  onlineLutSources,
}: {
  onlineLutSources: UseOnlineLutSourcesResult
}) {
  const sourceInputId = useId()
  const browserId = useId()
  const { state } = onlineLutSources
  const [openResourceId, setOpenResourceId] = useState<string | null>(null)
  const [browserLayout, setBrowserLayout] =
    useState<OnlineLutBrowserLayout | null>(null)
  const browserRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
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

  useEffect(() => {
    if (!openResource) return

    closeButtonRef.current?.focus()
  }, [openResource])

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

  useEffect(() => {
    if (!openResourceId) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      closeBrowser(openResourceId, { restoreFocus: true })
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (!(target instanceof Node)) return
      if (browserRef.current?.contains(target)) return
      if (openButtonRefs.current.get(openResourceId)?.contains(target)) return

      closeBrowser(openResourceId, { restoreFocus: true })
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [closeBrowser, openResourceId])

  const formatEntryCount = (count: number) =>
    count === 1 ? '1 LUT' : count > 1 ? `${count} LUTs` : 'No LUTs'
  const openBrowser =
    openResource &&
    browserLayout &&
    (() => {
      const browser = (
        <div
          id={browserId}
          ref={browserRef}
          className="raw-lut-source-browser"
          role="dialog"
          aria-label={`${openResource.label} LUTs`}
          data-lut-source-placement={browserLayout.placement}
          style={toBrowserStyle(browserLayout)}
        >
          <div className="raw-lut-source-browser-heading">
            <div>
              <span>{openResource.label}</span>
              <p>{formatEntryCount(openEntries.length)}</p>
            </div>
            <LutIconButton
              label="Close LUT source browser"
              buttonRef={closeButtonRef}
              onClick={() =>
                closeBrowser(openResource.id, { restoreFocus: true })
              }
            >
              <X aria-hidden="true" />
            </LutIconButton>
          </div>
          <div
            className="raw-lut-source-browser-list"
            data-lut-source-scroll="internal"
          >
            {openEntries.length > 0 ? (
              openEntries.map((entry) => (
                <div key={entry.id} className="raw-lut-source-entry">
                  <span className="raw-lut-source-entry-title">
                    {entry.title}
                  </span>
                  <LutIconButton
                    label={`Load ${entry.title}`}
                    onClick={() => void onlineLutSources.loadEntry(entry.id)}
                  >
                    <Download aria-hidden="true" />
                  </LutIconButton>
                </div>
              ))
            ) : (
              <p className="raw-lut-source-browser-empty">
                {openIssues.length > 0
                  ? 'No compatible LUTs loaded from this source.'
                  : 'No compatible LUTs yet.'}
              </p>
            )}
          </div>
        </div>
      )

      if (typeof document === 'undefined') return browser

      return createPortal(
        browser,
        document.querySelector('.raw-lab') ?? document.body,
      )
    })()

  return (
    <div className="raw-lut-source-controls">
      <div className="raw-lut-source-input-row">
        <label htmlFor={sourceInputId} className="sr-only">
          Online LUT source URL
        </label>
        <Input
          id={sourceInputId}
          type="url"
          value={onlineLutSources.sourceUrlInput}
          placeholder="https://.../catalog.json"
          onChange={(event) =>
            onlineLutSources.setSourceUrlInput(event.currentTarget.value)
          }
          inputClassName="h-8 text-xs"
        />
        <LutIconButton
          label="Add LUT source"
          disabled={!onlineLutSources.sourceUrlInput.trim()}
          onClick={() => void onlineLutSources.addSourceFromInput()}
        >
          <Plus aria-hidden="true" />
        </LutIconButton>
        <LutIconButton
          label="Copy LUT source link"
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
                      <span className="raw-lut-source-state">Loading</span>
                    )}
                    {hasIssue && (
                      <span className="raw-lut-source-state raw-lut-source-state-issue">
                        Issue
                      </span>
                    )}
                  </div>
                  <div className="raw-lut-source-actions">
                    <LutIconButton
                      label={`Open ${resource.label}`}
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
                      label={`Refresh ${resource.label}`}
                      busy={isResourceLoading}
                      onClick={() =>
                        void onlineLutSources.refreshSource(resource.id)
                      }
                    >
                      <RefreshCw aria-hidden="true" />
                    </LutIconButton>
                    <LutIconButton
                      label={`Remove ${resource.label}`}
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

export function LutContractTool({
  currentLutName,
  disabled,
  onLutLoad,
  onLutClear,
  lutProfileSelection,
  lutProfileResolution,
  onLutProfileSelect,
  onlineLutSources,
}: {
  currentLutName?: string | null
  disabled: boolean
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  lutProfileSelection?: LUTProfileSelectionState | null
  lutProfileResolution?: LUTProfileResolution | null
  onLutProfileSelect: (profile: LUTColorProfile) => void
  onlineLutSources?: UseOnlineLutSourcesResult
}) {
  return (
    <ToolSection title="LUT contract" eyebrow="Color">
      {onlineLutSources && (
        <OnlineLutSourceControls onlineLutSources={onlineLutSources} />
      )}
      <LutDropzone
        onFileDrop={onLutLoad}
        currentLut={currentLutName}
        onClear={onLutClear}
        disabled={disabled}
      />
      {currentLutName ? (
        <LUTProfileStatus
          key={lutProfileSelection?.fingerprint ?? currentLutName}
          selection={lutProfileSelection}
          resolution={lutProfileResolution}
          onSelect={onLutProfileSelect}
        />
      ) : (
        <p className="raw-tool-note">
          Add a .cube LUT only when its input and output contract is known.
        </p>
      )}
    </ToolSection>
  )
}
