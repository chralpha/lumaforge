import type {
  LUTColorProfile,
  LUTProfileResolution,
} from '@lumaforge/luma-color-runtime'
import { searchLUTColorProfiles } from '@lumaforge/luma-color-runtime'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertTriangle, ArrowLeft, Check, Plus, Share2, X } from 'lucide-react'
import { AnimatePresence, m, useDragControls } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { IconButton } from '~/components/ui/button'
import { Chip } from '~/components/ui/chip'
import { Dialog } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { useI18n } from '~/lib/i18n'
import { sheetSpring } from '~/lib/spring'

import type { UseOnlineLutSourcesResult } from '../../hooks/useOnlineLutSources'
import type { LUTProfileSelectionState } from '../../model/session'
import { useToolMotion } from '../../motion'
import { Dropzone } from '../Dropzone'
import type { LUTOutputOption } from '../tools/lut/lut-output-options'
import {
  dedupeOutputOptions,
  dedupeProfiles,
  groupOutputOptions,
  toDeclaredOutputOption,
  toOutputCarrierProfile,
  toSearchOutputOption,
} from '../tools/lut/lut-output-options'
import { groupEntriesByFamily } from '../tools/lut/lut-source-grouping'
import { LUTOutputOptionButton } from '../tools/lut/LUTOutputOptionButton'
import { LUTProfileButton } from '../tools/lut/LUTProfileButton'
import {
  composeLUTContractProfile,
  getContractAttentionState,
  getProfileOutputLabel,
  getResolvedProfile,
  groupProfiles,
} from '../tools/lut-contract'
import type { StrengthLevel } from '../tools/StrengthControl'
import { StrengthControl } from '../tools/StrengthControl'
import { MobileLutCatalogEntryButton } from './MobileLutCatalogEntryButton'
import { MobileLutSourceCard } from './MobileLutSourceCard'

export interface MobileLutBrowserProps {
  open: boolean
  onClose: () => void
  initialContractEditorOpen?: boolean
  currentLutName?: string | null
  disabled: boolean
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  lutProfileSelection?: LUTProfileSelectionState | null
  lutProfileResolution?: LUTProfileResolution | null
  onLutProfileSelect: (profile: LUTColorProfile) => void
  onlineLutSources?: UseOnlineLutSourcesResult
  activeIntensity?: StrengthLevel
  onIntensitySelect?: (level: StrengthLevel) => void
  strengthDisabled?: boolean
}

type OnlineResource = UseOnlineLutSourcesResult['state']['resources'][number]
type OnlineEntry = UseOnlineLutSourcesResult['state']['entries'][number]
type OnlineIssue = UseOnlineLutSourcesResult['state']['issues'][number]
type ContractStep = 'input' | 'output'
type MobileLutView = 'overview' | 'catalog' | 'contract'

const OUTPUT_REQUIRED_LABEL = 'Output profile required'

function resourceLabel(resource: OnlineResource) {
  return resource.label || resource.url
}

function ContractChip({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: 'neutral' | 'warning'
}) {
  return (
    <Chip
      tone={tone === 'warning' ? 'amber' : 'neutral'}
      size="sm"
      className="min-w-0 max-w-full"
    >
      {tone === 'warning' ? (
        <AlertTriangle aria-hidden="true" className="size-3 shrink-0" />
      ) : (
        <Check aria-hidden="true" className="size-3 shrink-0" />
      )}
      <span className="min-w-0 truncate">{label}</span>
    </Chip>
  )
}

function IssueChips({ issues }: { issues: OnlineIssue[] }) {
  if (issues.length === 0) return null

  return (
    <ul className="m-0 flex list-none flex-wrap gap-1 p-0" role="status">
      {issues.map((issue, index) => (
        <li
          key={[
            issue.code,
            issue.entryId ?? issue.sourceUrl ?? 'resource',
            index,
          ].join(':')}
          className="m-0 min-w-0"
        >
          <Chip tone="amber" size="sm" className="max-w-full">
            <AlertTriangle aria-hidden="true" className="size-3 shrink-0" />
            <span className="min-w-0 truncate">{issue.message}</span>
          </Chip>
        </li>
      ))}
    </ul>
  )
}

export function MobileLutBrowser(props: MobileLutBrowserProps) {
  const { t } = useI18n()
  const { prefersReduced } = useToolMotion()
  const dragControls = useDragControls()
  const onlineSourceInputId = useId()
  const activeIntensity = props.activeIntensity ?? 'standard'
  const strengthDisabled = props.strengthDisabled ?? true
  const [view, setView] = useState<MobileLutView>('overview')
  const [catalogResourceId, setCatalogResourceId] = useState<string | null>(
    null,
  )
  const [loadingEntryId, setLoadingEntryId] = useState<string | null>(null)
  const [contractStep, setContractStep] = useState<ContractStep>('input')
  const [contractQuery, setContractQuery] = useState('')
  const initialContractEditorAppliedRef = useRef(false)
  const overviewBodyRef = useRef<HTMLDivElement | null>(null)
  const catalogBodyRef = useRef<HTMLDivElement | null>(null)
  const contractBodyRef = useRef<HTMLDivElement | null>(null)

  const entriesByResourceId = useMemo(() => {
    const entries = new Map<string, OnlineEntry[]>()

    for (const resource of props.onlineLutSources?.state.resources ?? []) {
      entries.set(resource.id, [])
    }

    for (const entry of props.onlineLutSources?.state.entries ?? []) {
      entries.set(entry.resourceId, [
        ...(entries.get(entry.resourceId) ?? []),
        entry,
      ])
    }

    return entries
  }, [
    props.onlineLutSources?.state.entries,
    props.onlineLutSources?.state.resources,
  ])

  const issuesByResourceId = useMemo(() => {
    const issues = new Map<string, OnlineIssue[]>()

    for (const issue of props.onlineLutSources?.state.issues ?? []) {
      if (!issue.resourceId) continue

      issues.set(issue.resourceId, [
        ...(issues.get(issue.resourceId) ?? []),
        issue,
      ])
    }

    return issues
  }, [props.onlineLutSources?.state.issues])

  const profileSuggestions = useMemo(
    () =>
      props.lutProfileResolution?.kind === 'needs-user-selection'
        ? props.lutProfileResolution.suggestions
        : [],
    [props.lutProfileResolution],
  )
  const resolvedProfile = getResolvedProfile(
    props.lutProfileSelection,
    props.lutProfileResolution,
  )
  const outputLabel = getProfileOutputLabel(resolvedProfile)
  const displayOutputLabel =
    outputLabel && outputLabel !== OUTPUT_REQUIRED_LABEL
      ? outputLabel
      : undefined
  const attention = getContractAttentionState(
    props.lutProfileSelection,
    props.lutProfileResolution,
  )
  const [draftInputProfile, setDraftInputProfile] =
    useState<LUTColorProfile | null>(resolvedProfile ?? null)

  useEffect(() => {
    if (props.open) return

    setView('overview')
    setCatalogResourceId(null)
    setLoadingEntryId(null)
    setContractStep('input')
    setContractQuery('')
    setDraftInputProfile(resolvedProfile ?? null)
    initialContractEditorAppliedRef.current = false
  }, [props.open, resolvedProfile])

  useEffect(() => {
    if (
      !props.open ||
      !props.initialContractEditorOpen ||
      initialContractEditorAppliedRef.current
    ) {
      return
    }

    initialContractEditorAppliedRef.current = true
    setCatalogResourceId(null)
    setDraftInputProfile(resolvedProfile ?? null)
    setContractQuery('')
    setContractStep(
      attention.needsOutputContract && resolvedProfile ? 'output' : 'input',
    )
    setView('contract')
  }, [
    attention.needsOutputContract,
    props.initialContractEditorOpen,
    props.open,
    resolvedProfile,
  ])

  useEffect(() => {
    if (!props.open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [props.open])

  useEffect(() => {
    if (view !== 'catalog' || !catalogResourceId) return
    const resourceExists =
      props.onlineLutSources?.state.resources.some(
        (resource) => resource.id === catalogResourceId,
      ) ?? false

    if (!resourceExists) {
      setCatalogResourceId(null)
      setView('overview')
    }
  }, [catalogResourceId, props.onlineLutSources?.state.resources, view])

  const contractSearchResults = useMemo(
    () => searchLUTColorProfiles(contractQuery),
    [contractQuery],
  )
  const hasContractQuery = contractQuery.trim().length > 0
  const resultIds = useMemo(
    () => new Set(contractSearchResults.map((profile) => profile.id)),
    [contractSearchResults],
  )
  const visibleSuggestions = useMemo(
    () =>
      dedupeProfiles(profileSuggestions).filter(
        (profile) => !hasContractQuery || resultIds.has(profile.id),
      ),
    [hasContractQuery, profileSuggestions, resultIds],
  )
  const suggestionIds = useMemo(
    () => new Set(visibleSuggestions.map((profile) => profile.id)),
    [visibleSuggestions],
  )
  const groupedInputProfiles = useMemo(
    () =>
      groupProfiles(
        dedupeProfiles(contractSearchResults).filter(
          (profile) => !suggestionIds.has(profile.id),
        ),
      ),
    [contractSearchResults, suggestionIds],
  )
  const currentOutputOption = useMemo(
    () =>
      resolvedProfile ? toDeclaredOutputOption(resolvedProfile) : undefined,
    [resolvedProfile],
  )
  const suggestedOutputOptions = useMemo(
    () =>
      dedupeOutputOptions(
        [
          currentOutputOption,
          ...visibleSuggestions.map(
            (profile) =>
              toDeclaredOutputOption(profile) ?? toSearchOutputOption(profile),
          ),
        ].filter(Boolean) as LUTOutputOption[],
      ),
    [currentOutputOption, visibleSuggestions],
  )
  const groupedOutputOptions = useMemo(
    () =>
      groupOutputOptions(
        dedupeOutputOptions(
          contractSearchResults
            .filter((profile) => !suggestionIds.has(profile.id))
            .map(toSearchOutputOption),
        ),
      ),
    [contractSearchResults, suggestionIds],
  )
  const activeOutputOptionId = useMemo(() => {
    if (
      !resolvedProfile?.outputGamut ||
      !resolvedProfile.outputTransfer ||
      !resolvedProfile.outputRange
    ) {
      return undefined
    }

    return `${resolvedProfile.id}:declared-output`
  }, [resolvedProfile])
  const hasInputMatches =
    visibleSuggestions.length > 0 || groupedInputProfiles.length > 0
  const hasOutputMatches =
    suggestedOutputOptions.length > 0 || groupedOutputOptions.length > 0

  const selectedResource =
    props.onlineLutSources?.state.resources.find(
      (resource) => resource.id === catalogResourceId,
    ) ?? null
  const selectedEntries = useMemo(
    () =>
      selectedResource
        ? (entriesByResourceId.get(selectedResource.id) ?? [])
        : [],
    [entriesByResourceId, selectedResource],
  )
  const selectedIssues = useMemo(
    () =>
      selectedResource
        ? (issuesByResourceId.get(selectedResource.id) ?? [])
        : [],
    [issuesByResourceId, selectedResource],
  )
  const selectedResourceLoading = Boolean(
    selectedResource &&
    props.onlineLutSources?.state.isLoading &&
    props.onlineLutSources.state.activeResourceId === selectedResource.id,
  )
  const selectedEntryGroups = useMemo(
    () => groupEntriesByFamily(selectedEntries),
    [selectedEntries],
  )

  const scrollOverviewToTop = () => {
    requestAnimationFrame(() => {
      if (overviewBodyRef.current) overviewBodyRef.current.scrollTop = 0
    })
  }

  const returnToOverview = () => {
    setView('overview')
    setCatalogResourceId(null)
    scrollOverviewToTop()
  }

  const openContractView = (step: ContractStep = 'input') => {
    setDraftInputProfile(resolvedProfile ?? null)
    setContractQuery('')
    setContractStep(step)
    setCatalogResourceId(null)
    setView('contract')
  }

  const handleInputSelect = (profile: LUTColorProfile) => {
    setDraftInputProfile(profile)
    setContractQuery('')
    setContractStep('output')
    if (contractBodyRef.current) contractBodyRef.current.scrollTop = 0
  }

  const handleOutputSelect = (option: LUTOutputOption) => {
    const inputProfile = draftInputProfile ?? option.sourceProfile

    props.onLutProfileSelect(
      composeLUTContractProfile(inputProfile, toOutputCarrierProfile(option)),
    )
    setContractQuery('')
    returnToOverview()
  }

  const contractActionLabel = attention.needsUserSelection
    ? t('raw.mobile.lut.chooseContract')
    : attention.needsOutputContract
      ? t('raw.mobile.lut.chooseOutput')
      : t('raw.mobile.lut.changeContract')

  const handleOpenChange = (open: boolean) => {
    if (!open) props.onClose()
  }

  const viewMotion = prefersReduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
      }

  const renderCurrentSection = () => (
    <section className="grid gap-2">
      <h3 className="m-0 text-lf-body font-semibold text-lf-ink">
        {t('raw.mobile.lut.currentHeading')}
      </h3>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-lf-paper-warm/55 px-3 py-2.5">
        <span className="min-w-0 truncate text-[0.82rem] font-semibold text-lf-ink">
          {props.currentLutName ?? '-'}
        </span>
        <button
          type="button"
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-lf-hairline/45 bg-lf-paper px-2.5 text-xs font-semibold text-lf-ink/80 transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm hover:text-lf-ink disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!props.currentLutName || props.disabled}
          onClick={props.onLutClear}
        >
          {t('raw.mobile.lut.clear')}
        </button>
      </div>
    </section>
  )

  const renderStrengthSection = () => (
    <section className="grid gap-2" data-raw-mobile-lut="strength">
      <h3 className="m-0 text-lf-body font-semibold text-lf-ink">
        {t('raw.strength.title')}
      </h3>
      <StrengthControl
        value={activeIntensity}
        onChange={(level) => props.onIntensitySelect?.(level)}
        disabled={strengthDisabled}
        className="h-11 rounded-md border border-lf-hairline/45 bg-lf-paper-warm/55 p-1 text-lf-ink/60"
        itemClassName="text-lf-control data-[state=active]:text-lf-ink data-[state=active]:[&_span[data-segment-thumb]]:bg-lf-paper-high data-[state=active]:[&_span[data-segment-thumb]]:shadow-sm"
      />
    </section>
  )

  const renderContractStatusSection = () => {
    if (
      !props.currentLutName &&
      !props.lutProfileSelection &&
      !props.lutProfileResolution
    ) {
      return null
    }

    return (
      <section className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-lf-body font-semibold text-lf-ink">
            {t('raw.mobile.lut.contractHeading')}
          </h3>
          <span
            className={[
              'rounded-lf-pill border px-2 py-0.5 text-lf-eyebrow font-semibold',
              attention.needsAttention
                ? 'border-lf-amber bg-lf-amber-soft text-lf-ink'
                : 'border-lf-green-deep/30 bg-lf-green-soft text-lf-green-deep',
            ].join(' ')}
          >
            {attention.needsAttention
              ? t('raw.mobile.lut.contractNeedsReview')
              : t('raw.mobile.lut.contractResolved')}
          </span>
        </div>

        <div className="grid gap-2.5 rounded-md bg-lf-paper-warm/55 px-3 py-2.5">
          {attention.needsUserSelection ? (
            <p className="m-0 rounded-md border border-lf-amber/55 bg-lf-amber-soft/55 px-2.5 py-2 text-xs leading-relaxed text-lf-ink">
              {attention.unsupportedOutput
                ? t('raw.lutContract.unsupportedOutput')
                : t('raw.lutContract.unknown')}
            </p>
          ) : resolvedProfile ? (
            <div className="grid gap-2">
              <div className="grid gap-1">
                <span className="text-[0.66rem] font-semibold uppercase text-lf-ink/55 tracking-normal">
                  {t('raw.lutContract.inputTerm')}
                </span>
                <ContractChip label={resolvedProfile.label} />
              </div>
              <div className="grid gap-1">
                <span className="text-[0.66rem] font-semibold uppercase text-lf-ink/55 tracking-normal">
                  {t('raw.lutContract.outputTerm')}
                </span>
                <ContractChip
                  label={
                    displayOutputLabel ?? t('raw.mobile.lut.outputRequired')
                  }
                  tone={attention.needsOutputContract ? 'warning' : 'neutral'}
                />
              </div>
              {attention.needsOutputContract && (
                <p className="m-0 rounded-md border border-lf-amber/55 bg-lf-amber-soft/55 px-2.5 py-2 text-xs leading-relaxed text-lf-ink">
                  {t('raw.lutContract.needsOutput')}
                </p>
              )}
            </div>
          ) : (
            <p className="m-0 text-xs leading-relaxed text-lf-ink-soft">
              {t('raw.mobile.lut.noContract')}
            </p>
          )}

          <button
            type="button"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-lf-hairline/45 bg-lf-paper px-3 text-lf-control font-semibold text-lf-ink/80 transition-colors hover:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.045)] hover:text-lf-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green disabled:cursor-not-allowed disabled:opacity-50"
            disabled={props.disabled}
            onClick={() =>
              openContractView(
                attention.needsOutputContract && resolvedProfile
                  ? 'output'
                  : 'input',
              )
            }
          >
            {contractActionLabel}
          </button>
        </div>
      </section>
    )
  }

  const renderUploadSection = () => (
    <section className="grid gap-2.5">
      <h3 className="m-0 text-lf-body font-semibold text-lf-ink">
        {t('raw.mobile.lut.uploadHeading')}
      </h3>
      <Dropzone
        onFileDrop={props.onLutLoad}
        accept={['.cube']}
        multiple
        disabled={props.disabled}
        aria-label={t('raw.mobile.lut.uploadAria')}
        className="grid min-h-20 place-items-center border-lf-hairline/45 bg-lf-paper-warm/55 px-3 py-4 text-center"
        interactiveMotion={false}
      >
        <div className="grid gap-1">
          <span className="text-lf-control font-semibold text-lf-ink">
            {t('raw.mobile.lut.uploadTitle')}
          </span>
          <span className="text-xs text-lf-ink-soft">
            {t('raw.mobile.lut.uploadHint')}
          </span>
        </div>
      </Dropzone>
    </section>
  )

  const renderOnlineSourcesSection = () => {
    if (!props.onlineLutSources) return null

    return (
      <section className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-lf-body font-semibold text-lf-ink">
            {t('raw.mobile.lut.onlineHeading')}
          </h3>
          <button
            type="button"
            aria-label={t('raw.lutSource.copy')}
            disabled={!props.onlineLutSources.share.enabled}
            onClick={() => {
              props.onlineLutSources?.share.copy().then(
                () => toast.success(t('raw.lutSource.copied')),
                () => toast.error(t('raw.lutSource.copyFailed')),
              )
            }}
            className="grid size-[44px] shrink-0 place-items-center rounded-md bg-transparent text-lf-ink/55 transition-colors hover:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.045)] hover:text-lf-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Share2 aria-hidden="true" className="size-5" />
          </button>
        </div>
        <form
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!props.onlineLutSources?.sourceUrlInput.trim()) {
              return
            }
            void props.onlineLutSources?.addSourceFromInput()
          }}
        >
          <label htmlFor={onlineSourceInputId} className="sr-only">
            {t('raw.lutSource.url')}
          </label>
          <Input
            id={onlineSourceInputId}
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={props.onlineLutSources.sourceUrlInput}
            placeholder="https://.../catalog.json"
            onChange={(event) =>
              props.onlineLutSources?.setSourceUrlInput(
                event.currentTarget.value,
              )
            }
            inputClassName="h-[44px] rounded-md border-transparent bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.04)] text-lf-control text-lf-ink shadow-none placeholder:text-lf-ink/40 focus:border-transparent focus:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.06)] focus:ring-2 focus:ring-lf-green/25"
          />
          <button
            type="submit"
            aria-label={t('raw.lutSource.add')}
            disabled={!props.onlineLutSources.sourceUrlInput.trim()}
            className="grid size-[44px] shrink-0 place-items-center rounded-md bg-transparent text-lf-ink/55 transition-colors hover:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.045)] hover:text-lf-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus aria-hidden="true" className="size-5" />
          </button>
        </form>
        {props.onlineLutSources.state.resources.length === 0 && (
          <p className="m-0 text-xs leading-relaxed text-lf-ink-soft">
            {t('raw.lutSource.emptyHint')}
          </p>
        )}
        <div
          className="grid gap-2"
          aria-busy={props.onlineLutSources.state.isLoading}
        >
          {props.onlineLutSources.state.isLoading && (
            <p
              className="m-0 rounded-md bg-[oklch(from_var(--color-lf-green)_l_c_h_/_0.12)] px-2.5 py-2 text-xs font-semibold text-lf-green-deep"
              role="status"
            >
              {t('raw.mobile.lut.loading')}
            </p>
          )}
          {props.onlineLutSources.state.resources.map((resource) => {
            const entries = entriesByResourceId.get(resource.id) ?? []
            const resourceIssues = issuesByResourceId.get(resource.id) ?? []
            const isResourceLoading =
              props.onlineLutSources!.state.isLoading &&
              props.onlineLutSources!.state.activeResourceId === resource.id

            return (
              <div key={resource.id} className="grid gap-1.5">
                <MobileLutSourceCard
                  resource={resource}
                  entryCount={entries.length}
                  isLoading={isResourceLoading}
                  issues={resourceIssues}
                  onRefresh={() =>
                    void props.onlineLutSources?.refreshSource(resource.id)
                  }
                  onRemove={() =>
                    props.onlineLutSources?.removeSource(resource.id)
                  }
                />
                <button
                  type="button"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.04)] px-3 text-lf-control font-semibold text-lf-ink/75 transition-colors hover:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.065)] hover:text-lf-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green"
                  onClick={() => {
                    setCatalogResourceId(resource.id)
                    setView('catalog')
                  }}
                >
                  {t('raw.mobile.lut.browseEntries', {
                    count: entries.length,
                  })}
                </button>
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  const renderOverview = () => (
    <m.div
      key="overview"
      ref={overviewBodyRef}
      className="grid min-h-0 content-start gap-3 overflow-y-auto px-4 pb-5 pt-1"
      {...viewMotion}
      transition={sheetSpring}
    >
      {renderCurrentSection()}
      {renderStrengthSection()}
      {renderContractStatusSection()}
      {renderUploadSection()}
      {renderOnlineSourcesSection()}
    </m.div>
  )

  const handleCatalogEntryClick = async (entry: OnlineEntry) => {
    if (loadingEntryId || !props.onlineLutSources) return

    setLoadingEntryId(entry.id)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    try {
      await props.onlineLutSources.loadEntry(entry.id)
      returnToOverview()
    } catch {
      // per-resource issue chip surfaces the failure
    } finally {
      setLoadingEntryId(null)
    }
  }

  const renderCatalogEntry = (entry: OnlineEntry) => {
    const isEntryLoading = loadingEntryId === entry.id

    return (
      <MobileLutCatalogEntryButton
        key={entry.id}
        title={entry.title}
        loading={isEntryLoading}
        disabled={props.disabled}
        ariaLabel={t('raw.mobile.lut.loadEntry', { label: entry.title })}
        onClick={() => {
          void handleCatalogEntryClick(entry)
        }}
      />
    )
  }

  const renderCatalog = () => (
    <m.div
      key="catalog"
      ref={catalogBodyRef}
      className="grid min-h-0 content-start gap-3 overflow-y-auto px-4 pb-5 pt-1"
      {...viewMotion}
      transition={sheetSpring}
    >
      {selectedResource && (
        <div className="grid gap-2 px-1">
          {/* Sheet top bar already shows the resource label as title — keep
              this strip to count + transient pills + per-resource issues. */}
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="shrink-0 rounded-lf-pill bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.06)] px-1.5 py-0.5 text-lf-eyebrow font-medium leading-none text-lf-ink/55">
              {t('raw.mobile.lut.entryCount', {
                count: selectedEntries.length,
              })}
            </span>
            {selectedResourceLoading && (
              <span
                className="shrink-0 rounded-lf-pill bg-[oklch(from_var(--color-lf-green)_l_c_h_/_0.12)] px-1.5 py-0.5 text-lf-eyebrow font-medium leading-none text-lf-green-deep"
                role="status"
              >
                {t('raw.lutSource.loading')}
              </span>
            )}
          </div>
          <IssueChips issues={selectedIssues} />
        </div>
      )}

      {selectedEntries.length > 0 ? (
        <>
          {selectedEntryGroups.families.map(({ family, items }) => (
            <section key={family} className="grid gap-1.5">
              <h3 className="m-0 px-1 text-[0.7rem] font-medium tracking-tight text-lf-ink/50">
                {family}
              </h3>
              <div className="grid gap-1.5">
                {items.map(renderCatalogEntry)}
              </div>
            </section>
          ))}
          {selectedEntryGroups.others.length > 0 && (
            <section className="grid gap-1.5">
              <h3 className="m-0 px-1 text-[0.7rem] font-medium tracking-tight text-lf-ink/50">
                {t('raw.lutSource.others')}
              </h3>
              <div className="grid gap-1.5">
                {selectedEntryGroups.others.map(renderCatalogEntry)}
              </div>
            </section>
          )}
        </>
      ) : (
        <p className="m-0 text-lf-control leading-relaxed text-lf-ink-soft">
          {selectedIssues.length > 0
            ? t('raw.lutSource.noneCompatible')
            : t('raw.lutSource.noneYet')}
        </p>
      )}
    </m.div>
  )

  const renderContract = () => (
    <m.div
      key="contract"
      ref={contractBodyRef}
      className="grid min-h-0 content-start gap-2.5 overflow-y-auto px-4 pb-5 pt-1"
      {...viewMotion}
      transition={sheetSpring}
    >
      <div
        className="relative grid grid-cols-2 rounded-md bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.05)] p-1"
        role="tablist"
        aria-label={t('raw.lutContract.panels')}
      >
        {(['input', 'output'] as const).map((tabId) => {
          const isActive = contractStep === tabId
          const labelText =
            tabId === 'input'
              ? t('raw.lutContract.inputTab')
              : t('raw.lutContract.outputTab')
          return (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={[
                'relative z-10 min-h-[44px] rounded-[5px] px-2 text-lf-control font-semibold transition-colors duration-150',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green',
                isActive
                  ? 'text-lf-ink'
                  : 'text-lf-ink/55 hover:text-lf-ink/80',
              ].join(' ')}
              onClick={() => setContractStep(tabId)}
            >
              {isActive && (
                <m.span
                  layoutId="mobile-lut-contract-tab-indicator"
                  aria-hidden="true"
                  data-mobile-lut-contract-thumb
                  className="absolute inset-0 -z-10 rounded-[5px] bg-lf-paper-high shadow-sm"
                  transition={{
                    type: 'spring',
                    stiffness: 460,
                    damping: 38,
                    mass: 0.6,
                  }}
                />
              )}
              <span className="relative">{labelText}</span>
            </button>
          )
        })}
      </div>

      <label className="sr-only" htmlFor="mobile-lut-contract-search">
        {t('raw.lutContract.search')}
      </label>
      <input
        id="mobile-lut-contract-search"
        type="search"
        aria-label={t('raw.lutContract.search')}
        value={contractQuery}
        placeholder={t('raw.lutContract.searchPlaceholder')}
        onChange={(event) => setContractQuery(event.currentTarget.value)}
        className="min-h-[44px] rounded-md border border-transparent bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.04)] px-3 text-lf-control text-lf-ink outline-none placeholder:text-lf-ink/40 focus:border-transparent focus:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.06)] focus:ring-2 focus:ring-lf-green/25"
      />

      <div
        className="grid min-h-0 content-start gap-2 overflow-y-auto overscroll-contain pr-0.5"
        data-raw-mobile-lut="contract-list"
        data-lut-contract-step={contractStep}
      >
        {contractStep === 'input' ? (
          <>
            {visibleSuggestions.length > 0 && (
              <section className="grid gap-1">
                <h3 className="m-0 px-1 text-[0.7rem] font-medium tracking-tight text-lf-ink/50">
                  {t('raw.lutContract.suggestedInput')}
                </h3>
                {visibleSuggestions.map((profile) => (
                  <LUTProfileButton
                    key={profile.id}
                    profile={profile}
                    activeProfileId={draftInputProfile?.id}
                    size="touch"
                    ariaLabel={t('raw.lutContract.useInput', {
                      label: profile.label,
                    })}
                    onSelect={handleInputSelect}
                  />
                ))}
              </section>
            )}

            {groupedInputProfiles.map((group) => (
              <section key={`input-${group.label}`} className="grid gap-1">
                <h3 className="m-0 px-1 text-[0.7rem] font-medium tracking-tight text-lf-ink/50">
                  {t('raw.lutContract.groupInput', {
                    group: group.label,
                  })}
                </h3>
                {group.items.map((profile) => (
                  <LUTProfileButton
                    key={profile.id}
                    profile={profile}
                    activeProfileId={draftInputProfile?.id}
                    size="touch"
                    ariaLabel={t('raw.lutContract.useInput', {
                      label: profile.label,
                    })}
                    onSelect={handleInputSelect}
                  />
                ))}
              </section>
            ))}

            {!hasInputMatches && (
              <p className="m-0 text-lf-control leading-relaxed text-lf-ink-soft">
                {t('raw.lutContract.noInput')}
              </p>
            )}
          </>
        ) : (
          <>
            {suggestedOutputOptions.length > 0 && (
              <section className="grid gap-1">
                <h3 className="m-0 px-1 text-[0.7rem] font-medium tracking-tight text-lf-ink/50">
                  {t('raw.lutContract.suggestedOutput')}
                </h3>
                {suggestedOutputOptions.map((option) => (
                  <LUTOutputOptionButton
                    key={option.id}
                    option={option}
                    activeOptionId={activeOutputOptionId}
                    size="touch"
                    onSelect={handleOutputSelect}
                  />
                ))}
              </section>
            )}

            {groupedOutputOptions.map((group) => (
              <section key={`output-${group.label}`} className="grid gap-1">
                <h3 className="m-0 px-1 text-[0.7rem] font-medium tracking-tight text-lf-ink/50">
                  {t('raw.lutContract.groupOutput', {
                    group: group.label,
                  })}
                </h3>
                {group.items.map((option) => (
                  <LUTOutputOptionButton
                    key={option.id}
                    option={option}
                    activeOptionId={activeOutputOptionId}
                    size="touch"
                    onSelect={handleOutputSelect}
                  />
                ))}
              </section>
            ))}

            {!hasOutputMatches && (
              <p className="m-0 text-lf-control leading-relaxed text-lf-ink-soft">
                {t('raw.lutContract.noOutput')}
              </p>
            )}
          </>
        )}
      </div>
    </m.div>
  )

  const title =
    view === 'contract'
      ? t('raw.mobile.lut.editContract')
      : view === 'catalog' && selectedResource
        ? resourceLabel(selectedResource)
        : t('raw.mobile.lut.title')
  const canGoBack = view !== 'overview'

  return (
    <Dialog modal={false} open={props.open} onOpenChange={handleOpenChange}>
      <AnimatePresence>
        {props.open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Content
              asChild
              forceMount
              aria-label={t('raw.mobile.lut.title')}
              aria-describedby={undefined}
              onPointerDownOutside={(event) => event.preventDefault()}
              onInteractOutside={(event) => event.preventDefault()}
            >
              <m.aside
                key="lut-browser"
                data-mobile-substrate="ink-sheet"
                data-mobile-lut-view={view}
                className="absolute inset-x-0 bottom-0 z-[46] grid max-h-[82%] grid-rows-[auto_minmax(0,1fr)] rounded-t-xl border-t border-lf-hairline/40 bg-lf-paper-high pb-safe-offset-3 text-lf-ink shadow-[0_-14px_36px_-6px_oklch(0.18_0.018_76/0.22)]"
                initial={prefersReduced ? { opacity: 0 } : { y: '100%' }}
                animate={prefersReduced ? { opacity: 1 } : { y: '0%' }}
                exit={prefersReduced ? { opacity: 0 } : { y: '100%' }}
                transition={sheetSpring}
                drag={prefersReduced ? false : 'y'}
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.4 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 80 || info.velocity.y > 500)
                    props.onClose()
                }}
              >
                <div
                  className="grid gap-2 px-3.5 pb-3 pt-2.5"
                  onPointerDown={(event) => dragControls.start(event)}
                >
                  <div
                    aria-hidden="true"
                    className="mx-auto h-1 w-9 rounded-lf-pill bg-lf-ink/25"
                  />
                  <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2.5">
                    {canGoBack ? (
                      <IconButton
                        icon={ArrowLeft}
                        size="md"
                        aria-label={t('raw.mobile.lut.back')}
                        onClick={returnToOverview}
                        className="size-[44px] rounded-md bg-transparent text-lf-ink/55 transition-colors hover:bg-lf-ink/5 hover:text-lf-ink [&_svg]:size-5 [&_svg]:stroke-current"
                      />
                    ) : (
                      <span aria-hidden="true" />
                    )}
                    <DialogPrimitive.Title asChild>
                      <h2 className="m-0 min-w-0 truncate text-center text-[0.95rem] font-semibold text-lf-ink">
                        {title}
                      </h2>
                    </DialogPrimitive.Title>
                    <IconButton
                      icon={X}
                      size="md"
                      aria-label={t('raw.mobile.lut.close')}
                      onClick={props.onClose}
                      className="size-[44px] rounded-md bg-transparent text-lf-ink/55 transition-colors hover:bg-lf-ink/5 hover:text-lf-ink [&_svg]:size-5 [&_svg]:stroke-current"
                    />
                  </div>
                </div>

                <AnimatePresence mode="popLayout" initial={false}>
                  {view === 'overview'
                    ? renderOverview()
                    : view === 'catalog'
                      ? renderCatalog()
                      : renderContract()}
                </AnimatePresence>
              </m.aside>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </Dialog>
  )
}
