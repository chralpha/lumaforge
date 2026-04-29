import { useId, useMemo, useState } from 'react'

import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import type { LUTColorProfile } from '~/lib/color/registry'
import { searchLUTColorProfiles } from '~/lib/color/registry'
import type { LUTProfileResolution } from '~/lib/gl/pipeline'

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

export function LutContractTool({
  currentLutName,
  disabled,
  onLutLoad,
  onLutClear,
  lutProfileSelection,
  lutProfileResolution,
  onLutProfileSelect,
}: {
  currentLutName?: string | null
  disabled: boolean
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  lutProfileSelection?: LUTProfileSelectionState | null
  lutProfileResolution?: LUTProfileResolution | null
  onLutProfileSelect: (profile: LUTColorProfile) => void
}) {
  return (
    <ToolSection title="LUT contract" eyebrow="Color">
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
