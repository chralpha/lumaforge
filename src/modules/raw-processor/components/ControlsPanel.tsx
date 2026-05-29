/**
 * Controls panel for style-first RAW editing.
 */

import type {
  LUTColorProfile,
  LUTContractResolution,
} from '@lumaforge/luma-color-runtime'
import { searchLUTColorProfiles } from '@lumaforge/luma-color-runtime'
import { useAtomValue } from 'jotai'
import { m } from 'motion/react'
import { useId, useMemo, useState } from 'react'

import { Button } from '~/components/ui/button'
import { Divider } from '~/components/ui/divider'
import { Input } from '~/components/ui/input'
import { clsxm } from '~/lib/cn'
import { Spring } from '~/lib/spring'

import type { LUTContractSelectionState } from '../model/session'
import { exportDisabledReasonAtom } from '../state/session.atoms'
import { LutDropzone } from './Dropzone'
import { IntensityChips } from './IntensityChips'
import {
  getProfileContractLabel,
  getProfileOutputLabel,
  getResolvedProfile,
  groupProfiles,
  toSelectableContract,
} from './tools/lut-contract'

type ViewMode = 'processed' | 'original' | 'compare'

export interface ControlsPanelProps {
  activeIntensity: 'off' | 'light' | 'standard' | 'strong'
  viewMode: ViewMode
  onIntensitySelect: (level: 'off' | 'light' | 'standard' | 'strong') => void
  onCompareReset: () => void
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  onLutProfileSelect: (profile: LUTColorProfile) => void
  onExport: (options: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
  }) => void
  canExport: boolean
  disabledReason?: string
  isProcessing: boolean
  hasImage: boolean
  currentLutName?: string | null
  lutProfileSelection?: LUTContractSelectionState | null
  lutProfileResolution?: LUTContractResolution | null
  className?: string
}

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
      className={clsxm(
        'w-full rounded-lf-control border px-2.5 py-2 text-left text-lf-control leading-snug transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lf-green',
        isActive
          ? 'border-lf-green bg-lf-green/10 text-lf-ink'
          : highlighted
            ? 'border-lf-green/40 bg-lf-paper-low text-lf-ink'
            : 'border-lf-hairline bg-lf-paper text-lf-ink-soft hover:border-lf-green/40 hover:text-lf-ink',
      )}
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
        inputClassName="h-8 text-lf-control"
      />

      <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
        {visibleSuggestions.length > 0 && (
          <div className="space-y-1">
            <p className="text-lf-eyebrow font-medium uppercase text-lf-ink-soft">
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
            <p className="text-lf-eyebrow font-medium uppercase text-lf-ink-soft">
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
          <p className="text-lf-control text-lf-ink-soft">
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
  selection?: LUTContractSelectionState | null
  resolution?: LUTContractResolution | null
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
    selection?.status === 'pending' ? selection.recommendations : []
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
        <p className="rounded-lf-control border border-lf-green/30 bg-lf-green/10 px-3 py-2 text-lf-control leading-relaxed text-lf-ink-soft">
          This LUT output is not supported yet. Use a Rec.709 display LUT for
          this build.
        </p>
      ) : isPending ? (
        <p className="rounded-lf-control border border-lf-green/30 bg-lf-green/10 px-3 py-2 text-lf-control leading-relaxed text-lf-ink-soft">
          {UNKNOWN_LUT_COPY}
        </p>
      ) : resolvedProfile ? (
        <div className="space-y-1.5 text-xs leading-relaxed">
          <p className="grid grid-cols-[4.7rem_minmax(0,1fr)] gap-2">
            <span className="text-lf-ink-soft">LUT input:</span>
            <span className="min-w-0 break-words text-lf-ink">
              {resolvedProfile.label}
            </span>
          </p>
          {outputLabel && (
            <p className="grid grid-cols-[4.7rem_minmax(0,1fr)] gap-2">
              <span className="text-lf-ink-soft">LUT output:</span>
              <span className="min-w-0 break-words text-lf-ink">
                {outputLabel}
              </span>
            </p>
          )}
          {needsOutputContract && (
            <p className="rounded-lf-control border border-lf-green/30 bg-lf-green/10 px-3 py-2 text-lf-control leading-relaxed text-lf-ink-soft">
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

export function ControlsPanel({
  activeIntensity,
  onIntensitySelect,
  onCompareReset,
  onLutLoad,
  onLutClear,
  onLutProfileSelect,
  onExport,
  canExport,
  disabledReason,
  isProcessing,
  hasImage,
  currentLutName,
  lutProfileSelection,
  lutProfileResolution,
  className,
}: ControlsPanelProps) {
  const sessionExportDisabledReason = useAtomValue(exportDisabledReasonAtom)
  const resolvedExportDisabledReason =
    disabledReason ??
    sessionExportDisabledReason ??
    'Full-resolution export source is still loading.'

  return (
    <m.div
      data-raw-panel="controls"
      className={clsxm(
        'flex flex-col gap-6 p-5 bg-lf-paper-high rounded-lf-panel border border-lf-hairline',
        className,
      )}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={Spring.presets.smooth}
    >
      <div className="raw-lab-controls-grid space-y-6">
        <section className="space-y-3">
          <p className="text-lf-control font-medium text-lf-ink">Intensity</p>
          <IntensityChips
            value={activeIntensity}
            onChange={onIntensitySelect}
          />
        </section>

        <Divider />

        <section className="space-y-2">
          <p className="text-sm font-medium text-text">Compare</p>
          <p className="text-xs leading-relaxed text-text-secondary">
            Drag the split on the image.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={onCompareReset}
            disabled={!hasImage || isProcessing}
          >
            Reset compare view
          </Button>
        </section>

        <Divider />

        <section className="space-y-2">
          <p className="text-lf-control font-medium text-lf-ink">Custom LUT</p>
          <LutDropzone
            onFileDrop={onLutLoad}
            currentLut={currentLutName}
            onClear={onLutClear}
            disabled={!hasImage || isProcessing}
          />
          {currentLutName && (
            <LUTProfileStatus
              key={lutProfileSelection?.fingerprint ?? currentLutName}
              selection={lutProfileSelection}
              resolution={lutProfileResolution}
              onSelect={onLutProfileSelect}
            />
          )}
          <p className="text-lf-control text-lf-ink-soft">
            `.cube` LUTs run in a best effort path for Phase 1.
          </p>
        </section>

        <Divider />

        <section className="space-y-3">
          <p className="text-sm font-medium text-text">Full-resolution JPEG</p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onExport({ quality: 'high', fidelity: 'balanced' })}
            disabled={!canExport || isProcessing}
            className="w-full"
          >
            Export full-resolution JPEG
          </Button>
          <p className="text-xs text-text-tertiary">
            {canExport
              ? 'Exports from the LibRaw processed-window path, not the visible preview.'
              : resolvedExportDisabledReason}
          </p>
        </section>
      </div>
    </m.div>
  )
}
