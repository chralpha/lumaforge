import type {
  LUTColorProfile,
  LUTProfileResolution,
} from '@lumaforge/luma-color-runtime'
import { searchLUTColorProfiles } from '@lumaforge/luma-color-runtime'
import {
  Download,
  FolderOpen,
  Plus,
  RefreshCw,
  Share2,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import type { CSSProperties, ReactNode, Ref, RefObject } from 'react'
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

import { Input } from '~/components/ui/input'

import type { UseOnlineLutSourcesResult } from '../../hooks/useOnlineLutSources'
import type { LUTProfileSelectionState } from '../../model/session'
import { LutDropzone } from '../Dropzone'
import {
  composeLUTContractProfile,
  getProfileAsOutputLabel,
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
    triggerRect.left,
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
    height: `${layout.maxHeight}px`,
  }
}

function LUTProfileButton({
  profile,
  activeProfileId,
  onSelect,
  label,
  ariaLabel,
  highlighted = false,
}: {
  profile: LUTColorProfile
  activeProfileId?: string
  onSelect: (profile: LUTColorProfile) => void
  label?: string
  ariaLabel?: string
  highlighted?: boolean
}) {
  const isActive = activeProfileId === profile.id
  const buttonLabel = label ?? getProfileContractLabel(profile)

  return (
    <button
      type="button"
      aria-label={ariaLabel ?? buttonLabel}
      aria-pressed={isActive}
      onClick={() => onSelect(profile)}
      className={
        isActive
          ? 'raw-lut-contract-option raw-lut-contract-option-active'
          : highlighted
            ? 'raw-lut-contract-option raw-lut-contract-option-suggested'
            : 'raw-lut-contract-option'
      }
    >
      <span className="block min-w-0 break-words">{buttonLabel}</span>
    </button>
  )
}

type LUTContractBrowserStep = 'input' | 'output'

type LUTOutputOption = {
  id: string
  label: string
  gamut: LUTColorProfile['inputGamut']
  transfer: LUTColorProfile['inputTransfer']
  range: LUTColorProfile['inputRange']
  sourceProfile: LUTColorProfile
}

function dedupeProfiles(profiles: LUTColorProfile[]) {
  const seen = new Set<string>()
  return profiles.filter((profile) => {
    if (seen.has(profile.id)) return false
    seen.add(profile.id)
    return true
  })
}

function dedupeOutputOptions(options: LUTOutputOption[]) {
  const seen = new Set<string>()
  return options.filter((option) => {
    if (seen.has(option.id)) return false
    seen.add(option.id)
    return true
  })
}

function getOutputGroupLabel(profile: LUTColorProfile) {
  if (profile.role === 'display-look') return 'Output'
  if (profile.label.startsWith('ARRI')) return 'ARRI'
  if (profile.label.startsWith('RED')) return 'RED'
  if (profile.label.startsWith('Nikon')) return 'Nikon'
  if (profile.label.startsWith('Sony')) return 'Sony'
  if (profile.label.startsWith('Canon')) return 'Canon'
  if (profile.label.startsWith('Fujifilm')) return 'Fujifilm'
  if (profile.label.startsWith('Panasonic')) return 'Panasonic'
  if (profile.label.startsWith('ACES')) return 'ACES'
  return 'Other'
}

function toDeclaredOutputOption(
  profile: LUTColorProfile,
): LUTOutputOption | undefined {
  const selectable = toSelectableContract(profile)
  if (
    !selectable?.outputGamut ||
    !selectable.outputTransfer ||
    !selectable.outputRange
  ) {
    return undefined
  }

  return {
    id: `${profile.id}:declared-output`,
    label:
      getProfileOutputLabel(selectable) ?? getProfileAsOutputLabel(profile),
    gamut: selectable.outputGamut,
    transfer: selectable.outputTransfer,
    range: selectable.outputRange,
    sourceProfile: profile,
  }
}

function toSearchOutputOption(profile: LUTColorProfile): LUTOutputOption {
  return {
    id: `${profile.id}:search-output`,
    label: profile.label,
    gamut: profile.inputGamut,
    transfer: profile.inputTransfer,
    range: profile.inputRange,
    sourceProfile: profile,
  }
}

function toOutputCarrierProfile(option: LUTOutputOption): LUTColorProfile {
  return {
    ...option.sourceProfile,
    inputGamut: option.gamut,
    inputTransfer: option.transfer,
    inputRange: option.range,
    outputGamut: undefined,
    outputTransfer: undefined,
    outputRange: undefined,
  }
}

function groupOutputOptions(options: LUTOutputOption[]) {
  const groups = new Map<string, LUTOutputOption[]>()

  for (const option of options) {
    const group = getOutputGroupLabel(option.sourceProfile)
    groups.set(group, [...(groups.get(group) ?? []), option])
  }

  return Array.from(groups.entries()).map(([label, items]) => ({
    label,
    items,
  }))
}

function LUTOutputOptionButton({
  option,
  activeOptionId,
  onSelect,
  highlighted = false,
}: {
  option: LUTOutputOption
  activeOptionId?: string
  onSelect: (option: LUTOutputOption) => void
  highlighted?: boolean
}) {
  const isActive = activeOptionId === option.id

  return (
    <button
      type="button"
      aria-label={`Use ${option.label} as LUT output`}
      aria-pressed={isActive}
      onClick={() => onSelect(option)}
      className={
        isActive
          ? 'raw-lut-contract-option raw-lut-contract-option-active'
          : highlighted
            ? 'raw-lut-contract-option raw-lut-contract-option-suggested'
            : 'raw-lut-contract-option'
      }
    >
      <span className="block min-w-0 break-words">{option.label}</span>
    </button>
  )
}

function LUTContractBrowser({
  open,
  onClose,
  suggestions,
  currentProfile,
  onSelect,
  triggerRef,
}: {
  open: boolean
  onClose: (options?: { restoreFocus?: boolean }) => void
  suggestions: LUTColorProfile[]
  currentProfile?: LUTColorProfile
  onSelect: (profile: LUTColorProfile) => void
  triggerRef: RefObject<HTMLButtonElement | null>
}) {
  const searchInputId = useId()
  const browserId = useId()
  const browserRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const [browserLayout, setBrowserLayout] =
    useState<OnlineLutBrowserLayout | null>(null)
  const [query, setQuery] = useState('')
  const [step, setStep] = useState<LUTContractBrowserStep>('input')
  const [draftInputProfile, setDraftInputProfile] =
    useState<LUTColorProfile | null>(currentProfile ?? null)
  const hasQuery = query.trim().length > 0
  const searchResults = useMemo(() => searchLUTColorProfiles(query), [query])
  const resultIds = useMemo(
    () => new Set(searchResults.map((profile) => profile.id)),
    [searchResults],
  )

  useEffect(() => {
    if (!open) return

    setQuery('')
    setStep('input')
    setDraftInputProfile(currentProfile ?? null)
    setBrowserLayout(
      getViewportBoundedBrowserLayout(triggerRef.current ?? undefined),
    )
  }, [currentProfile, open, triggerRef])

  const updateBrowserLayout = useCallback(() => {
    if (!open) return
    setBrowserLayout(
      getViewportBoundedBrowserLayout(triggerRef.current ?? undefined),
    )
  }, [open, triggerRef])

  useLayoutEffect(() => {
    updateBrowserLayout()
  }, [open, updateBrowserLayout])

  useEffect(() => {
    if (!open) return

    closeButtonRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      onClose({ restoreFocus: true })
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (!(target instanceof Node)) return
      if (browserRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return

      onClose({ restoreFocus: true })
    }
    const handleViewportChange = () => {
      updateBrowserLayout()
    }

    const scrollTargets = [
      triggerRef.current?.closest('.raw-tool-stack'),
      triggerRef.current?.closest('.raw-tool-surface'),
    ].filter((target): target is Element => target instanceof Element)

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', handleViewportChange)
    for (const target of scrollTargets) {
      target.addEventListener('scroll', handleViewportChange)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', handleViewportChange)
      for (const target of scrollTargets) {
        target.removeEventListener('scroll', handleViewportChange)
      }
    }
  }, [onClose, open, triggerRef, updateBrowserLayout])

  const visibleSuggestions = useMemo(
    () =>
      dedupeProfiles(suggestions).filter(
        (profile) => !hasQuery || resultIds.has(profile.id),
      ),
    [hasQuery, resultIds, suggestions],
  )
  const suggestionIds = useMemo(
    () => new Set(visibleSuggestions.map((profile) => profile.id)),
    [visibleSuggestions],
  )
  const groupedInputProfiles = useMemo(
    () =>
      groupProfiles(
        dedupeProfiles(searchResults).filter(
          (profile) => !suggestionIds.has(profile.id),
        ),
      ),
    [searchResults, suggestionIds],
  )
  const suggestedOutputOptions = useMemo(
    () =>
      dedupeOutputOptions(
        visibleSuggestions
          .map(
            (profile) =>
              toDeclaredOutputOption(profile) ?? toSearchOutputOption(profile),
          )
          .filter(Boolean) as LUTOutputOption[],
      ),
    [visibleSuggestions],
  )
  const groupedOutputOptions = useMemo(
    () =>
      groupOutputOptions(
        dedupeOutputOptions(
          searchResults
            .filter((profile) => !suggestionIds.has(profile.id))
            .map(toSearchOutputOption),
        ),
      ),
    [searchResults, suggestionIds],
  )
  const activeOutputOptionId = useMemo(() => {
    if (
      !currentProfile?.outputGamut ||
      !currentProfile.outputTransfer ||
      !currentProfile.outputRange
    ) {
      return undefined
    }

    return `${currentProfile.id}:declared-output`
  }, [currentProfile])

  const handleInputSelect = (profile: LUTColorProfile) => {
    setDraftInputProfile(profile)
    setStep('output')
  }

  const handleOutputSelect = (option: LUTOutputOption) => {
    const inputProfile = draftInputProfile ?? option.sourceProfile

    onSelect(
      composeLUTContractProfile(inputProfile, toOutputCarrierProfile(option)),
    )
    onClose({ restoreFocus: true })
  }

  const hasInputMatches =
    visibleSuggestions.length > 0 || groupedInputProfiles.length > 0
  const hasOutputMatches =
    suggestedOutputOptions.length > 0 || groupedOutputOptions.length > 0

  if (!open || !browserLayout) return null

  const browser = (
    <div
      id={browserId}
      ref={browserRef}
      className="raw-lut-contract-browser"
      role="dialog"
      aria-label="LUT contract browser"
      data-lut-source-placement={browserLayout.placement}
      style={toBrowserStyle(browserLayout)}
    >
      <div className="raw-lut-contract-browser-heading">
        <div>
          <span>LUT contract browser</span>
          <p>
            {draftInputProfile
              ? `Input: ${draftInputProfile.label}`
              : 'Choose input first, then output'}
          </p>
        </div>
        <LutIconButton
          label="Close LUT contract browser"
          buttonRef={closeButtonRef}
          onClick={() => onClose({ restoreFocus: true })}
        >
          <X aria-hidden="true" />
        </LutIconButton>
      </div>

      <div
        className="raw-lut-contract-browser-tabs"
        role="tablist"
        aria-label="LUT contract panels"
      >
        <button
          type="button"
          role="tab"
          aria-selected={step === 'input'}
          className="raw-lut-contract-browser-tab"
          onClick={() => setStep('input')}
        >
          Input
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={step === 'output'}
          className="raw-lut-contract-browser-tab"
          onClick={() => setStep('output')}
        >
          Output
        </button>
      </div>

      <label htmlFor={searchInputId} className="sr-only">
        Search LUT contract
      </label>
      <Input
        id={searchInputId}
        type="search"
        value={query}
        placeholder="Search camera/log or output"
        onChange={(event) => setQuery(event.currentTarget.value)}
        inputClassName="raw-lut-input h-8 text-xs"
      />

      <div
        className="raw-lut-contract-browser-list"
        data-lut-contract-step={step}
      >
        {step === 'input' ? (
          <>
            {visibleSuggestions.length > 0 && (
              <div className="space-y-1">
                <p className="raw-lut-contract-browser-group">
                  Suggested input
                </p>
                <div className="space-y-1">
                  {visibleSuggestions.map((profile) => (
                    <LUTProfileButton
                      key={profile.id}
                      profile={profile}
                      activeProfileId={draftInputProfile?.id}
                      label={profile.label}
                      ariaLabel={`Use ${profile.label} as LUT input`}
                      onSelect={handleInputSelect}
                      highlighted
                    />
                  ))}
                </div>
              </div>
            )}

            {groupedInputProfiles.map((group) => (
              <div key={`input-${group.label}`} className="space-y-1">
                <p className="raw-lut-contract-browser-group">
                  {group.label} input
                </p>
                <div className="space-y-1">
                  {group.items.map((profile) => (
                    <LUTProfileButton
                      key={profile.id}
                      profile={profile}
                      activeProfileId={draftInputProfile?.id}
                      label={profile.label}
                      ariaLabel={`Use ${profile.label} as LUT input`}
                      onSelect={handleInputSelect}
                    />
                  ))}
                </div>
              </div>
            ))}

            {!hasInputMatches && (
              <p className="raw-lut-contract-browser-empty">
                No matching LUT input.
              </p>
            )}
          </>
        ) : (
          <>
            {suggestedOutputOptions.length > 0 && (
              <div className="space-y-1">
                <p className="raw-lut-contract-browser-group">
                  Suggested output
                </p>
                <div className="space-y-1">
                  {suggestedOutputOptions.map((option) => (
                    <LUTOutputOptionButton
                      key={option.id}
                      option={option}
                      activeOptionId={activeOutputOptionId}
                      onSelect={handleOutputSelect}
                      highlighted
                    />
                  ))}
                </div>
              </div>
            )}

            {groupedOutputOptions.map((group) => (
              <div key={`output-${group.label}`} className="space-y-1">
                <p className="raw-lut-contract-browser-group">
                  {group.label} output
                </p>
                <div className="space-y-1">
                  {group.items.map((option) => (
                    <LUTOutputOptionButton
                      key={option.id}
                      option={option}
                      activeOptionId={activeOutputOptionId}
                      onSelect={handleOutputSelect}
                    />
                  ))}
                </div>
              </div>
            ))}

            {!hasOutputMatches && (
              <p className="raw-lut-contract-browser-empty">
                No matching LUT output.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )

  if (typeof document === 'undefined') return browser

  return createPortal(
    browser,
    document.querySelector('.raw-lab') ?? document.body,
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
  const [browserOpen, setBrowserOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const handleClose = useCallback((options?: { restoreFocus?: boolean }) => {
    setBrowserOpen(false)

    if (options?.restoreFocus) {
      queueMicrotask(() => triggerRef.current?.focus())
    }
  }, [])

  if (!selection && !resolution) return null

  return (
    <div className="space-y-2 pt-1">
      {isUnsupportedOutput ? (
        <p className="raw-lut-contract-status raw-lut-contract-status-amber">
          This LUT output is not supported yet. Use a Rec.709 display LUT for
          this build.
        </p>
      ) : isPending ? (
        <p className="raw-lut-contract-status raw-lut-contract-status-amber">
          {UNKNOWN_LUT_COPY}
        </p>
      ) : resolvedProfile ? (
        <div className="raw-lut-contract-facts">
          <p className="raw-lut-contract-fact">
            <span className="raw-lut-contract-term">LUT input:</span>
            <span className="raw-lut-contract-value">
              {resolvedProfile.label}
            </span>
          </p>
          {outputLabel && (
            <p className="raw-lut-contract-fact">
              <span className="raw-lut-contract-term">LUT output:</span>
              <span className="raw-lut-contract-value">{outputLabel}</span>
            </p>
          )}
          {needsOutputContract && (
            <p className="raw-lut-contract-status raw-lut-contract-status-amber">
              Choose the LUT output before preview or export.
            </p>
          )}
        </div>
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        className="raw-lut-contract-change-button"
        onClick={() => {
          if (browserOpen) {
            handleClose({ restoreFocus: true })
          } else {
            setBrowserOpen(true)
          }
        }}
      >
        <SlidersHorizontal aria-hidden="true" />
        Change LUT contract
      </button>

      <LUTContractBrowser
        open={browserOpen}
        onClose={handleClose}
        suggestions={suggestions}
        currentProfile={resolvedProfile}
        onSelect={onSelect}
        triggerRef={triggerRef}
      />
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
                      label={`Load ${entry.title}`}
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
                          Others
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
          Add a .cube LUT now, it stays staged until a RAW file is loaded.
        </p>
      )}
    </ToolSection>
  )
}
