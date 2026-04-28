/**
 * Controls panel for style-first RAW editing.
 */

import { useAtomValue } from 'jotai'
import { m } from 'motion/react'
import { useId, useMemo, useState } from 'react'

import { Button } from '~/components/ui/button'
import { Divider } from '~/components/ui/divider'
import { Input } from '~/components/ui/input'
import { clsxm } from '~/lib/cn'
import type { LUTColorProfile } from '~/lib/color/registry'
import {
  getColorGamut,
  getLUTColorProfile,
  getTransferFunction,
  searchLUTColorProfiles,
} from '~/lib/color/registry'
import type { LUTProfileResolution } from '~/lib/gl/pipeline'
import { Spring } from '~/lib/spring'

import type { LUTProfileSelectionState } from '../model/session'
import { exportDisabledReasonAtom } from '../state/session.atoms'
import { LutDropzone } from './Dropzone'
import { IntensityChips } from './IntensityChips'

type ViewMode = 'processed' | 'original' | 'compare'

export interface ControlsPanelProps {
  presetOptions: Array<{ id: string; name: string }>
  activePresetId: string | null
  activeIntensity: 'off' | 'light' | 'standard' | 'strong'
  viewMode: ViewMode
  onPresetSelect: (id: string) => void
  onIntensitySelect: (level: 'off' | 'light' | 'standard' | 'strong') => void
  onViewModeChange: (mode: ViewMode) => void
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
  lutProfileSelection?: LUTProfileSelectionState | null
  lutProfileResolution?: LUTProfileResolution | null
  className?: string
}

const UNKNOWN_LUT_COPY =
  'Choose the LUT input and output contract before preview or export.'
const DISPLAY_LIKE_INPUT_TRANSFERS = new Set(['srgb', 'bt709', 'gamma24'])

function getResolvedProfile(
  selection?: LUTProfileSelectionState | null,
  resolution?: LUTProfileResolution | null,
) {
  if (resolution?.kind === 'resolved') return resolution.profile
  if (selection?.status === 'resolved') {
    return getLUTColorProfile(selection.profileId)
  }
  return undefined
}

function hasDisplayLikeInput(profile: LUTColorProfile) {
  return (
    profile.inputGamut === 'srgb-rec709' &&
    DISPLAY_LIKE_INPUT_TRANSFERS.has(profile.inputTransfer)
  )
}

function getProfileOutputLabel(profile?: LUTColorProfile) {
  if (!profile) return undefined

  if (!profile.outputGamut || !profile.outputTransfer || !profile.outputRange) {
    if (profile.role === 'display-look' && hasDisplayLikeInput(profile)) {
      return 'Rec.709 display'
    }
    return 'Output profile required'
  }

  if (
    profile.outputGamut === 'srgb-rec709' &&
    ['srgb', 'bt709', 'gamma24'].includes(profile.outputTransfer)
  ) {
    return 'Rec.709 display'
  }

  const gamut = profile.outputGamut
    ? (getColorGamut(profile.outputGamut)?.label ?? profile.outputGamut)
    : undefined
  const transfer = profile.outputTransfer
    ? (getTransferFunction(profile.outputTransfer)?.label ??
      profile.outputTransfer)
    : undefined

  return [gamut, transfer].filter(Boolean).join(' / ')
}

function hasAnyOutputContractField(profile: LUTColorProfile) {
  return Boolean(
    profile.outputGamut || profile.outputTransfer || profile.outputRange,
  )
}

function hasSelectableOutputContract(profile: LUTColorProfile) {
  if (profile.role === 'display-look' && hasDisplayLikeInput(profile)) {
    return true
  }

  return Boolean(
    profile.outputGamut && profile.outputTransfer && profile.outputRange,
  )
}

function getDefaultRec709Contract(profile: LUTColorProfile): LUTColorProfile {
  return {
    ...profile,
    role: 'combined-look-output',
    outputGamut: 'srgb-rec709',
    outputTransfer: 'bt709',
    outputRange: 'full',
  }
}

function toSelectableContract(profile: LUTColorProfile) {
  if (hasSelectableOutputContract(profile)) return profile
  if (!hasAnyOutputContractField(profile) && !hasDisplayLikeInput(profile)) {
    return getDefaultRec709Contract(profile)
  }
  return undefined
}

function getProfileContractLabel(profile: LUTColorProfile) {
  const outputLabel = getProfileOutputLabel(profile)
  if (
    outputLabel &&
    outputLabel !== 'Output profile required' &&
    !hasDisplayLikeInput(profile)
  ) {
    return `${profile.label} -> ${outputLabel}`
  }

  return profile.label
}

function getProfileGroupLabel(profile: LUTColorProfile) {
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

function groupProfiles(profiles: LUTColorProfile[]) {
  const groups = new Map<string, LUTColorProfile[]>()

  for (const profile of profiles) {
    const group = getProfileGroupLabel(profile)
    groups.set(group, [...(groups.get(group) ?? []), profile])
  }

  return Array.from(groups.entries()).map(([label, items]) => ({
    label,
    items,
  }))
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
      className={clsxm(
        'w-full rounded-md border px-2.5 py-2 text-left text-xs leading-snug transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        isActive
          ? 'border-accent bg-accent/10 text-text'
          : highlighted
            ? 'border-accent/40 bg-fill text-text'
            : 'border-border bg-background text-text-secondary hover:border-accent/40 hover:text-text',
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
        <p className="border-l-2 border-accent/70 pl-3 text-xs leading-relaxed text-text-secondary">
          This LUT output is not supported yet. Use a Rec.709 display LUT for
          this build.
        </p>
      ) : isPending ? (
        <p className="border-l-2 border-accent/70 pl-3 text-xs leading-relaxed text-text-secondary">
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
            <p className="border-l-2 border-accent/70 pl-3 text-text-secondary">
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
  presetOptions,
  activePresetId,
  activeIntensity,
  viewMode,
  onPresetSelect,
  onIntensitySelect,
  onViewModeChange,
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
      className={clsxm(
        'flex flex-col gap-6 p-5 bg-material-medium rounded-xl border border-border',
        className,
      )}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={Spring.presets.smooth}
    >
      <div className="space-y-6">
        <section className="space-y-3">
          <label className="text-sm font-medium text-text">Builtin looks</label>
          <div className="grid grid-cols-2 gap-2">
            {presetOptions.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onPresetSelect(preset.id)}
                disabled={!hasImage || isProcessing}
                className={
                  activePresetId === preset.id
                    ? 'rounded-xl border border-accent bg-accent/10 px-3 py-3 text-left text-sm text-text'
                    : 'rounded-xl border border-border bg-background px-3 py-3 text-left text-sm text-text-secondary'
                }
              >
                {preset.name}
              </button>
            ))}
          </div>
        </section>

        <Divider />

        <section className="space-y-3">
          <label className="text-sm font-medium text-text">Intensity</label>
          <IntensityChips
            value={activeIntensity}
            onChange={onIntensitySelect}
          />
        </section>

        <Divider />

        <section className="space-y-3">
          <label className="text-sm font-medium text-text">Compare</label>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'processed' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onViewModeChange('processed')}
            >
              Processed
            </Button>
            <Button
              variant={viewMode === 'original' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onViewModeChange('original')}
            >
              Original
            </Button>
          </div>
        </section>

        <Divider />

        <section className="space-y-2">
          <label className="text-sm font-medium text-text">Custom LUT</label>
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
          <p className="text-xs text-text-tertiary">
            `.cube` LUTs run in a best effort path for Phase 1.
          </p>
        </section>

        <Divider />

        <section className="space-y-3">
          <label className="text-sm font-medium text-text">
            Full-resolution JPEG
          </label>
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

/**
 * Compact metadata display.
 */
export function MetadataPanel({
  metadata,
  className,
}: {
  metadata: {
    make?: string
    model?: string
    lens?: string
    iso?: number
    aperture?: number
    focalLength?: number
    shutterSpeed?: string
    width: number
    height: number
  }
  className?: string
}) {
  const items = [
    {
      label: 'Camera',
      value: `${metadata.make || ''} ${metadata.model || ''}`.trim(),
    },
    { label: 'Lens', value: metadata.lens },
    { label: 'ISO', value: metadata.iso },
    {
      label: 'Aperture',
      value: metadata.aperture ? `f/${metadata.aperture}` : undefined,
    },
    {
      label: 'Focal',
      value: metadata.focalLength ? `${metadata.focalLength}mm` : undefined,
    },
    { label: 'Shutter', value: metadata.shutterSpeed },
    { label: 'Size', value: `${metadata.width} × ${metadata.height}` },
  ].filter((item) => item.value)

  return (
    <m.div
      className={clsxm(
        'grid grid-cols-2 gap-x-4 gap-y-2 p-4 bg-fill/50 rounded-lg text-xs',
        className,
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={Spring.presets.smooth}
    >
      {items.map((item) => (
        <div key={item.label} className="flex justify-between">
          <span className="text-text-tertiary">{item.label}</span>
          <span className="text-text-secondary font-medium">{item.value}</span>
        </div>
      ))}
    </m.div>
  )
}

/**
 * Processing stats display.
 */
export function StatsPanel({
  stats,
  className,
}: {
  stats: {
    processTime: number
    inputSize: { width: number; height: number }
    previewSize: { width: number; height: number }
    capabilityWarnings?: { code: string }[]
  }
  className?: string
}) {
  const hasLowPrecisionWarning = stats.capabilityWarnings?.some(
    (warning) => warning.code === 'LOW_PRECISION_RENDER_TARGET',
  )

  return (
    <div
      className={clsxm(
        'flex items-center gap-4 text-xs text-text-tertiary',
        className,
      )}
    >
      <span>Process: {stats.processTime.toFixed(1)}ms</span>
      <span>
        Preview: {stats.previewSize.width}×{stats.previewSize.height}
      </span>
      <span>
        Full: {stats.inputSize.width}×{stats.inputSize.height}
      </span>
      {hasLowPrecisionWarning && <span>Limited GPU precision</span>}
    </div>
  )
}
