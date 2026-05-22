import type {
  LUTColorProfile,
  LUTProfileResolution,
} from '@lumaforge/luma-color-runtime'
import { searchLUTColorProfiles } from '@lumaforge/luma-color-runtime'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  AlertTriangle,
  Check,
  Plus,
  RefreshCw,
  Share2,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { AnimatePresence, m, useDragControls } from 'motion/react'
import type { ReactNode } from 'react'
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
import {
  composeLUTContractProfile,
  getProfileOutputLabel,
  getResolvedProfile,
  groupProfiles,
} from '../tools/lut-contract'

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
}

type OnlineResource = UseOnlineLutSourcesResult['state']['resources'][number]
type OnlineEntry = UseOnlineLutSourcesResult['state']['entries'][number]
type OnlineIssue = UseOnlineLutSourcesResult['state']['issues'][number]
type ContractStep = 'input' | 'output'

const OUTPUT_REQUIRED_LABEL = 'Output profile required'

function resourceLabel(resource: OnlineResource) {
  return resource.label || resource.url
}

function MobileContractOptionButton({
  children,
  ariaLabel,
  active = false,
  highlighted = false,
  onClick,
}: {
  children: ReactNode
  ariaLabel: string
  active?: boolean
  highlighted?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={onClick}
      className={[
        'grid min-w-0 gap-1 rounded-lf-control border px-2.5 py-2 text-left text-lf-control transition-colors',
        active
          ? 'border-lf-green bg-lf-green/15 text-lf-hero-ink'
          : highlighted
            ? 'border-lf-amber/45 bg-lf-amber/12 text-lf-hero-ink'
            : 'border-lf-on-photo-bord-soft bg-lf-on-photo-bg text-lf-hero-ink/82 hover:border-lf-amber/40 hover:text-lf-hero-ink',
      ].join(' ')}
      data-raw-mobile-lut="contract-option"
    >
      {children}
    </button>
  )
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
      surface="on-photo"
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

export function MobileLutBrowser(props: MobileLutBrowserProps) {
  const { t } = useI18n()
  const { prefersReduced } = useToolMotion()
  const dragControls = useDragControls()
  const onlineSourceInputId = useId()
  const [contractEditorOpen, setContractEditorOpen] = useState(false)
  const [contractStep, setContractStep] = useState<ContractStep>('input')
  const [contractQuery, setContractQuery] = useState('')
  const initialContractEditorAppliedRef = useRef(false)
  const sheetBodyRef = useRef<HTMLDivElement | null>(null)
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
  const needsOutputContract = outputLabel === OUTPUT_REQUIRED_LABEL
  const displayOutputLabel =
    outputLabel && !needsOutputContract ? outputLabel : undefined
  const needsUserSelection =
    props.lutProfileResolution?.kind === 'needs-user-selection'
  const unsupportedOutput =
    props.lutProfileResolution?.kind === 'needs-user-selection' &&
    props.lutProfileResolution.reason === 'unsupported-output'
  const contractNeedsAttention =
    needsUserSelection || needsOutputContract || unsupportedOutput
  const [draftInputProfile, setDraftInputProfile] =
    useState<LUTColorProfile | null>(resolvedProfile ?? null)

  useEffect(() => {
    if (props.open) return

    setContractEditorOpen(false)
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
    setDraftInputProfile(resolvedProfile ?? null)
    setContractQuery('')
    setContractStep(needsOutputContract && resolvedProfile ? 'output' : 'input')
    setContractEditorOpen(true)
  }, [
    needsOutputContract,
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

  const openContractEditor = (step: ContractStep = 'input') => {
    setDraftInputProfile(resolvedProfile ?? null)
    setContractQuery('')
    setContractStep(step)
    setContractEditorOpen(true)
  }
  const handleInputSelect = (profile: LUTColorProfile) => {
    setDraftInputProfile(profile)
    setContractQuery('')
    setContractStep('output')
  }
  const handleOutputSelect = (option: LUTOutputOption) => {
    const inputProfile = draftInputProfile ?? option.sourceProfile

    props.onLutProfileSelect(
      composeLUTContractProfile(inputProfile, toOutputCarrierProfile(option)),
    )
    setContractEditorOpen(false)
    setContractQuery('')
    if (sheetBodyRef.current) {
      sheetBodyRef.current.scrollTop = 0
    }
  }
  const contractActionLabel = needsUserSelection
    ? t('raw.mobile.lut.chooseContract')
    : needsOutputContract
      ? t('raw.mobile.lut.chooseOutput')
      : t('raw.mobile.lut.changeContract')

  const handleOpenChange = (open: boolean) => {
    if (!open) props.onClose()
  }

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
                className="absolute inset-x-0 bottom-0 z-[46] grid max-h-[82%] grid-rows-[auto_minmax(0,1fr)] rounded-t-lf-panel border-t border-lf-on-photo-bord bg-lf-dark pb-safe-offset-3 text-lf-hero-ink shadow-lf-popover"
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
                    className="mx-auto h-1 w-9 rounded-lf-pill bg-lf-hero-ink/30"
                  />
                  <div className="flex items-center justify-between gap-2.5">
                    <DialogPrimitive.Title asChild>
                      <h2 className="m-0 text-lf-title font-semibold">
                        {t('raw.mobile.lut.title')}
                      </h2>
                    </DialogPrimitive.Title>
                    <IconButton
                      icon={X}
                      size="md"
                      aria-label={t('raw.mobile.lut.close')}
                      onClick={props.onClose}
                      className="size-11 rounded-lf-control border border-lf-on-photo-bord bg-lf-on-photo-bg text-lf-hero-ink [&_svg]:size-5 [&_svg]:stroke-lf-hero-ink"
                    />
                  </div>
                </div>

                <div
                  ref={sheetBodyRef}
                  className="grid min-h-0 gap-[18px] overflow-y-auto px-4 pb-5 pt-1"
                >
                  <section className="grid gap-2.5">
                    <h3 className="m-0 text-lf-control font-semibold text-lf-hero-ink">
                      {t('raw.mobile.lut.currentHeading')}
                    </h3>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lf-panel border border-lf-on-photo-bord-soft bg-lf-on-photo-bg p-3">
                      <span className="min-w-0 truncate text-lf-control font-semibold text-lf-hero-ink">
                        {props.currentLutName ?? '—'}
                      </span>
                      <button
                        type="button"
                        className="rounded-lf-control border border-lf-on-photo-bord bg-lf-on-photo-bg px-2.5 py-1.5 text-xs font-semibold text-lf-hero-ink transition-colors hover:border-lf-amber/50 hover:text-lf-amber disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!props.currentLutName || props.disabled}
                        onClick={props.onLutClear}
                      >
                        {t('raw.mobile.lut.clear')}
                      </button>
                    </div>
                  </section>

                  {(props.currentLutName ||
                    props.lutProfileSelection ||
                    props.lutProfileResolution) && (
                    <section className="grid gap-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="m-0 text-lf-control font-semibold text-lf-hero-ink">
                          {t('raw.mobile.lut.contractHeading')}
                        </h3>
                        <span
                          className={[
                            'rounded-lf-pill border px-2 py-0.5 text-lf-eyebrow font-semibold',
                            contractNeedsAttention
                              ? 'border-lf-amber/40 bg-lf-amber/12 text-lf-amber-soft'
                              : 'border-lf-green/35 bg-lf-green/12 text-lf-green',
                          ].join(' ')}
                        >
                          {contractNeedsAttention
                            ? t('raw.mobile.lut.contractNeedsReview')
                            : t('raw.mobile.lut.contractResolved')}
                        </span>
                      </div>

                      <div className="grid gap-2.5 rounded-lf-panel border border-lf-on-photo-bord-soft bg-lf-on-photo-bg p-3">
                        {needsUserSelection ? (
                          <p className="m-0 rounded-lf-control border border-lf-amber/35 bg-lf-amber/10 px-2.5 py-2 text-xs leading-relaxed text-lf-amber-soft">
                            {unsupportedOutput
                              ? t('raw.lutContract.unsupportedOutput')
                              : t('raw.lutContract.unknown')}
                          </p>
                        ) : resolvedProfile ? (
                          <div className="grid gap-2">
                            <div className="grid gap-1">
                              <span className="text-lf-eyebrow font-semibold uppercase text-lf-hero-ink/48">
                                {t('raw.lutContract.inputTerm')}
                              </span>
                              <ContractChip label={resolvedProfile.label} />
                            </div>
                            <div className="grid gap-1">
                              <span className="text-lf-eyebrow font-semibold uppercase text-lf-hero-ink/48">
                                {t('raw.lutContract.outputTerm')}
                              </span>
                              <ContractChip
                                label={
                                  displayOutputLabel ??
                                  t('raw.mobile.lut.outputRequired')
                                }
                                tone={
                                  needsOutputContract ? 'warning' : 'neutral'
                                }
                              />
                            </div>
                            {needsOutputContract && (
                              <p className="m-0 rounded-lf-control border border-lf-amber/35 bg-lf-amber/10 px-2.5 py-2 text-xs leading-relaxed text-lf-amber-soft">
                                {t('raw.lutContract.needsOutput')}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="m-0 text-xs leading-relaxed text-lf-hero-ink/68">
                            {t('raw.mobile.lut.noContract')}
                          </p>
                        )}

                        <button
                          type="button"
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lf-control border border-lf-amber/35 bg-lf-amber/12 px-3 text-lf-control font-semibold text-lf-amber-soft transition-colors hover:border-lf-amber/60 hover:text-lf-hero-ink disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={props.disabled}
                          onClick={() =>
                            openContractEditor(
                              needsOutputContract && resolvedProfile
                                ? 'output'
                                : 'input',
                            )
                          }
                        >
                          <SlidersHorizontal
                            aria-hidden="true"
                            className="size-4"
                          />
                          {contractActionLabel}
                        </button>
                      </div>

                      {contractEditorOpen && (
                        <div className="grid gap-2.5 rounded-lf-panel border border-lf-on-photo-bord-soft bg-lf-on-photo-bg p-3">
                          <div
                            className="grid grid-cols-2 gap-1.5"
                            role="tablist"
                            aria-label={t('raw.lutContract.panels')}
                          >
                            <button
                              type="button"
                              role="tab"
                              aria-selected={contractStep === 'input'}
                              className="min-h-9 rounded-lf-control border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-2 text-lf-control font-semibold text-lf-hero-ink/68 transition-colors aria-selected:border-lf-amber/45 aria-selected:bg-lf-amber/12 aria-selected:text-lf-amber-soft"
                              onClick={() => setContractStep('input')}
                            >
                              {t('raw.lutContract.inputTab')}
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={contractStep === 'output'}
                              className="min-h-9 rounded-lf-control border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-2 text-lf-control font-semibold text-lf-hero-ink/68 transition-colors aria-selected:border-lf-amber/45 aria-selected:bg-lf-amber/12 aria-selected:text-lf-amber-soft"
                              onClick={() => setContractStep('output')}
                            >
                              {t('raw.lutContract.outputTab')}
                            </button>
                          </div>

                          <label
                            className="sr-only"
                            htmlFor="mobile-lut-contract-search"
                          >
                            {t('raw.lutContract.search')}
                          </label>
                          <input
                            id="mobile-lut-contract-search"
                            type="search"
                            aria-label={t('raw.lutContract.search')}
                            value={contractQuery}
                            placeholder={t('raw.lutContract.searchPlaceholder')}
                            onChange={(event) =>
                              setContractQuery(event.currentTarget.value)
                            }
                            className="min-h-10 rounded-lf-control border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-3 text-lf-control text-lf-hero-ink outline-none placeholder:text-lf-hero-ink/42 focus:border-lf-amber/55"
                          />

                          <div
                            className="grid max-h-[34vh] min-h-0 content-start gap-1.5 overflow-y-auto overscroll-contain pr-0.5"
                            data-raw-mobile-lut="contract-list"
                            data-lut-contract-step={contractStep}
                          >
                            {contractStep === 'input' ? (
                              <>
                                {visibleSuggestions.length > 0 && (
                                  <div className="grid gap-1">
                                    <p className="m-0 text-lf-eyebrow font-semibold uppercase text-lf-hero-ink/48">
                                      {t('raw.lutContract.suggestedInput')}
                                    </p>
                                    {visibleSuggestions.map((profile) => (
                                      <MobileContractOptionButton
                                        key={profile.id}
                                        ariaLabel={t(
                                          'raw.lutContract.useInput',
                                          {
                                            label: profile.label,
                                          },
                                        )}
                                        active={
                                          draftInputProfile?.id === profile.id
                                        }
                                        highlighted
                                        onClick={() =>
                                          handleInputSelect(profile)
                                        }
                                      >
                                        <span className="min-w-0 truncate font-semibold">
                                          {profile.label}
                                        </span>
                                        <span className="text-xs text-lf-hero-ink/58">
                                          {profile.role}
                                        </span>
                                      </MobileContractOptionButton>
                                    ))}
                                  </div>
                                )}

                                {groupedInputProfiles.map((group) => (
                                  <div
                                    key={`input-${group.label}`}
                                    className="grid gap-1"
                                  >
                                    <p className="m-0 text-lf-eyebrow font-semibold uppercase text-lf-hero-ink/48">
                                      {t('raw.lutContract.groupInput', {
                                        group: group.label,
                                      })}
                                    </p>
                                    {group.items.map((profile) => (
                                      <MobileContractOptionButton
                                        key={profile.id}
                                        ariaLabel={t(
                                          'raw.lutContract.useInput',
                                          {
                                            label: profile.label,
                                          },
                                        )}
                                        active={
                                          draftInputProfile?.id === profile.id
                                        }
                                        onClick={() =>
                                          handleInputSelect(profile)
                                        }
                                      >
                                        <span className="min-w-0 truncate font-semibold">
                                          {profile.label}
                                        </span>
                                        <span className="text-xs text-lf-hero-ink/58">
                                          {profile.role}
                                        </span>
                                      </MobileContractOptionButton>
                                    ))}
                                  </div>
                                ))}

                                {!hasInputMatches && (
                                  <p className="m-0 text-lf-control leading-relaxed text-lf-hero-ink/68">
                                    {t('raw.lutContract.noInput')}
                                  </p>
                                )}
                              </>
                            ) : (
                              <>
                                {suggestedOutputOptions.length > 0 && (
                                  <div className="grid gap-1">
                                    <p className="m-0 text-lf-eyebrow font-semibold uppercase text-lf-hero-ink/48">
                                      {t('raw.lutContract.suggestedOutput')}
                                    </p>
                                    {suggestedOutputOptions.map((option) => (
                                      <MobileContractOptionButton
                                        key={option.id}
                                        ariaLabel={t(
                                          'raw.lutContract.useOutput',
                                          {
                                            label: option.label,
                                          },
                                        )}
                                        active={
                                          activeOutputOptionId === option.id
                                        }
                                        highlighted
                                        onClick={() =>
                                          handleOutputSelect(option)
                                        }
                                      >
                                        <span className="min-w-0 truncate font-semibold">
                                          {option.label}
                                        </span>
                                      </MobileContractOptionButton>
                                    ))}
                                  </div>
                                )}

                                {groupedOutputOptions.map((group) => (
                                  <div
                                    key={`output-${group.label}`}
                                    className="grid gap-1"
                                  >
                                    <p className="m-0 text-lf-eyebrow font-semibold uppercase text-lf-hero-ink/48">
                                      {t('raw.lutContract.groupOutput', {
                                        group: group.label,
                                      })}
                                    </p>
                                    {group.items.map((option) => (
                                      <MobileContractOptionButton
                                        key={option.id}
                                        ariaLabel={t(
                                          'raw.lutContract.useOutput',
                                          {
                                            label: option.label,
                                          },
                                        )}
                                        active={
                                          activeOutputOptionId === option.id
                                        }
                                        onClick={() =>
                                          handleOutputSelect(option)
                                        }
                                      >
                                        <span className="min-w-0 truncate font-semibold">
                                          {option.label}
                                        </span>
                                      </MobileContractOptionButton>
                                    ))}
                                  </div>
                                ))}

                                {!hasOutputMatches && (
                                  <p className="m-0 text-lf-control leading-relaxed text-lf-hero-ink/68">
                                    {t('raw.lutContract.noOutput')}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </section>
                  )}

                  <section className="grid gap-2.5">
                    <h3 className="m-0 text-lf-control font-semibold text-lf-hero-ink">
                      {t('raw.mobile.lut.uploadHeading')}
                    </h3>
                    <Dropzone
                      onFileDrop={props.onLutLoad}
                      accept={['.cube']}
                      multiple
                      disabled={props.disabled}
                      aria-label={t('raw.mobile.lut.uploadAria')}
                      className="grid min-h-20 place-items-center border-lf-on-photo-bord bg-lf-on-photo-bg px-3 py-4 text-center"
                      interactiveMotion={false}
                    >
                      <div className="grid gap-1">
                        <span className="text-lf-control font-semibold text-lf-hero-ink">
                          {t('raw.mobile.lut.uploadTitle')}
                        </span>
                        <span className="text-xs text-lf-hero-ink/70">
                          {t('raw.mobile.lut.uploadHint')}
                        </span>
                      </div>
                    </Dropzone>
                  </section>

                  {props.onlineLutSources && (
                    <section className="grid gap-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="m-0 text-lf-control font-semibold text-lf-hero-ink">
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
                          className="grid size-11 shrink-0 place-items-center rounded-lf-control border border-lf-on-photo-bord-soft bg-lf-on-photo-bg text-lf-hero-ink transition-colors hover:border-lf-amber/40 hover:text-lf-hero-ink disabled:cursor-not-allowed disabled:opacity-50"
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
                        <label
                          htmlFor={onlineSourceInputId}
                          className="sr-only"
                        >
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
                          inputClassName="h-11 rounded-lf-control border-lf-on-photo-bord-soft bg-lf-on-photo-bg text-lf-control text-lf-hero-ink shadow-none placeholder:text-lf-hero-ink/48 focus:border-lf-green focus:ring-lf-green/20"
                        />
                        <button
                          type="submit"
                          aria-label={t('raw.lutSource.add')}
                          disabled={
                            !props.onlineLutSources.sourceUrlInput.trim()
                          }
                          className="grid size-11 shrink-0 place-items-center rounded-lf-control border border-lf-on-photo-bord-soft bg-lf-on-photo-bg text-lf-hero-ink transition-colors hover:border-lf-amber/40 hover:text-lf-hero-ink disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Plus aria-hidden="true" className="size-5" />
                        </button>
                      </form>
                      {props.onlineLutSources.state.resources.length === 0 && (
                        <p className="m-0 text-xs leading-relaxed text-lf-hero-ink/68">
                          {t('raw.lutSource.emptyHint')}
                        </p>
                      )}
                      <div
                        className="grid gap-2"
                        aria-busy={props.onlineLutSources.state.isLoading}
                      >
                        {props.onlineLutSources.state.isLoading && (
                          <p
                            className="m-0 rounded-lf-control border border-lf-green/30 bg-lf-green/10 px-2.5 py-2 text-xs font-semibold text-lf-green"
                            role="status"
                          >
                            {t('raw.mobile.lut.loading')}
                          </p>
                        )}
                        {props.onlineLutSources.state.resources.map(
                          (resource) => {
                            const entries =
                              entriesByResourceId.get(resource.id) ?? []
                            const resourceIssues =
                              issuesByResourceId.get(resource.id) ?? []
                            const isResourceLoading =
                              props.onlineLutSources!.state.isLoading &&
                              props.onlineLutSources!.state.activeResourceId ===
                                resource.id

                            return (
                              <div
                                key={resource.id}
                                className="grid gap-1.5 rounded-lf-panel border border-lf-on-photo-bord-soft bg-lf-on-photo-bg p-2.5"
                              >
                                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                    <span className="min-w-0 truncate text-lf-control font-semibold text-lf-hero-ink">
                                      {resourceLabel(resource)}
                                    </span>
                                    <span className="shrink-0 rounded-lf-pill border border-lf-on-photo-bord bg-lf-on-photo-bg px-1.5 py-0.5 text-lf-eyebrow font-semibold leading-none text-lf-hero-ink/70">
                                      {t('raw.mobile.lut.entryCount', {
                                        count: entries.length,
                                      })}
                                    </span>
                                    {isResourceLoading && (
                                      <span
                                        className="shrink-0 rounded-lf-pill border border-lf-green/30 bg-lf-green/10 px-1.5 py-0.5 text-lf-eyebrow font-semibold leading-none text-lf-green"
                                        role="status"
                                      >
                                        {t('raw.lutSource.loading')}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 gap-1">
                                    <button
                                      type="button"
                                      aria-label={t('raw.lutSource.refresh', {
                                        label: resourceLabel(resource),
                                      })}
                                      aria-busy={isResourceLoading}
                                      disabled={isResourceLoading}
                                      onClick={() =>
                                        void props.onlineLutSources?.refreshSource(
                                          resource.id,
                                        )
                                      }
                                      className="grid size-11 place-items-center rounded-lf-control border border-lf-on-photo-bord-soft bg-lf-on-photo-bg text-lf-hero-ink transition-colors hover:border-lf-amber/40 hover:text-lf-hero-ink disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <RefreshCw
                                        aria-hidden="true"
                                        className={`size-5 ${isResourceLoading ? 'animate-spin' : ''}`}
                                      />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={t('raw.lutSource.remove', {
                                        label: resourceLabel(resource),
                                      })}
                                      onClick={() =>
                                        props.onlineLutSources?.removeSource(
                                          resource.id,
                                        )
                                      }
                                      className="grid size-11 place-items-center rounded-lf-control border border-lf-on-photo-bord-soft bg-lf-on-photo-bg text-lf-hero-ink transition-colors hover:border-lf-amber/40 hover:text-lf-hero-ink"
                                    >
                                      <Trash2
                                        aria-hidden="true"
                                        className="size-5"
                                      />
                                    </button>
                                  </div>
                                </div>
                                {resourceIssues.length > 0 && (
                                  <ul
                                    className="m-0 grid list-none gap-1 p-0"
                                    role="status"
                                    aria-live="polite"
                                  >
                                    {resourceIssues.map((issue, index) => (
                                      <li
                                        key={[
                                          issue.code,
                                          issue.entryId ??
                                            issue.sourceUrl ??
                                            'resource',
                                          index,
                                        ].join(':')}
                                        className="m-0"
                                      >
                                        <Chip
                                          tone="amber"
                                          surface="on-photo"
                                          size="sm"
                                          className="max-w-full"
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
                                    ))}
                                  </ul>
                                )}
                                <div className="grid gap-1.5">
                                  {entries.map((entry) => (
                                    <button
                                      key={entry.id}
                                      type="button"
                                      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lf-control border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-2.5 py-2 text-left transition-colors hover:border-lf-amber/40 disabled:cursor-not-allowed disabled:opacity-50"
                                      disabled={props.disabled}
                                      aria-label={t(
                                        'raw.mobile.lut.loadEntry',
                                        {
                                          label: entry.title,
                                        },
                                      )}
                                      onClick={() =>
                                        void props.onlineLutSources?.loadEntry(
                                          entry.id,
                                        )
                                      }
                                    >
                                      <span className="min-w-0 truncate text-lf-control font-medium text-lf-hero-ink">
                                        {entry.title}
                                      </span>
                                      <span className="text-xs font-semibold text-lf-amber">
                                        {t('raw.mobile.lut.load')}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )
                          },
                        )}
                      </div>
                    </section>
                  )}
                </div>
              </m.aside>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </Dialog>
  )
}
