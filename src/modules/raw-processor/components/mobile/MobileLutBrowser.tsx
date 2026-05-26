import type {
  LUTColorProfile,
  LUTProfileResolution,
} from '@lumaforge/luma-color-runtime'
import { searchLUTColorProfiles } from '@lumaforge/luma-color-runtime'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  AlertTriangle,
  Check,
  Loader2,
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
        'grid min-h-[44px] min-w-0 gap-1 rounded-md border px-2.5 py-2 text-left text-lf-control transition-colors',
        active
          ? 'border-lf-green bg-lf-green-soft text-lf-ink'
          : highlighted
            ? 'border-lf-amber/55 bg-lf-amber-soft text-lf-ink'
            : 'border-lf-hairline/40 bg-lf-paper text-lf-ink-soft hover:border-lf-amber/55 hover:bg-lf-paper-warm/60 hover:text-lf-ink',
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
  const [loadingEntryId, setLoadingEntryId] = useState<string | null>(null)
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
                  <div className="flex items-center justify-between gap-2.5">
                    <DialogPrimitive.Title asChild>
                      <h2 className="m-0 text-[0.95rem] font-semibold text-lf-ink">
                        {t('raw.mobile.lut.title')}
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

                <div
                  ref={sheetBodyRef}
                  className="grid min-h-0 gap-3 overflow-y-auto px-4 pb-5 pt-1"
                >
                  <section className="grid gap-2">
                    <h3 className="m-0 text-lf-body font-semibold text-lf-ink">
                      {t('raw.mobile.lut.currentHeading')}
                    </h3>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-lf-paper-warm/55 px-3 py-2.5">
                      <span className="min-w-0 truncate text-[0.82rem] font-semibold text-lf-ink">
                        {props.currentLutName ?? '—'}
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

                  {(props.currentLutName ||
                    props.lutProfileSelection ||
                    props.lutProfileResolution) && (
                    <section className="grid gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="m-0 text-lf-body font-semibold text-lf-ink">
                          {t('raw.mobile.lut.contractHeading')}
                        </h3>
                        <span
                          className={[
                            'rounded-lf-pill border px-2 py-0.5 text-lf-eyebrow font-semibold',
                            contractNeedsAttention
                              ? 'border-lf-amber bg-lf-amber-soft text-lf-ink'
                              : 'border-lf-green-deep/30 bg-lf-green-soft text-lf-green-deep',
                          ].join(' ')}
                        >
                          {contractNeedsAttention
                            ? t('raw.mobile.lut.contractNeedsReview')
                            : t('raw.mobile.lut.contractResolved')}
                        </span>
                      </div>

                      <div className="grid gap-2.5 rounded-md bg-lf-paper-warm/55 px-3 py-2.5">
                        {needsUserSelection ? (
                          <p className="m-0 rounded-md border border-lf-amber/55 bg-lf-amber-soft/55 px-2.5 py-2 text-xs leading-relaxed text-lf-ink">
                            {unsupportedOutput
                              ? t('raw.lutContract.unsupportedOutput')
                              : t('raw.lutContract.unknown')}
                          </p>
                        ) : resolvedProfile ? (
                          <div className="grid gap-2">
                            <div className="grid gap-1">
                              <span className="text-[0.66rem] tracking-tight font-semibold uppercase text-lf-ink/55">
                                {t('raw.lutContract.inputTerm')}
                              </span>
                              <ContractChip label={resolvedProfile.label} />
                            </div>
                            <div className="grid gap-1">
                              <span className="text-[0.66rem] tracking-tight font-semibold uppercase text-lf-ink/55">
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
                          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-lf-amber/55 bg-lf-amber-soft px-3 text-lf-control font-semibold text-lf-ink transition-colors hover:border-lf-amber hover:bg-lf-amber/30 disabled:cursor-not-allowed disabled:opacity-50"
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
                        <div className="grid gap-2.5 rounded-md bg-lf-paper-warm/55 px-3 py-2.5">
                          <div
                            className="grid grid-cols-2 gap-1.5"
                            role="tablist"
                            aria-label={t('raw.lutContract.panels')}
                          >
                            <button
                              type="button"
                              role="tab"
                              aria-selected={contractStep === 'input'}
                              className="min-h-[44px] rounded-md border border-lf-hairline/45 bg-lf-paper px-2 text-lf-control font-semibold text-lf-ink-soft transition-colors aria-selected:border-lf-amber/55 aria-selected:bg-lf-amber-soft aria-selected:text-lf-ink"
                              onClick={() => setContractStep('input')}
                            >
                              {t('raw.lutContract.inputTab')}
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={contractStep === 'output'}
                              className="min-h-[44px] rounded-md border border-lf-hairline/45 bg-lf-paper px-2 text-lf-control font-semibold text-lf-ink-soft transition-colors aria-selected:border-lf-amber/55 aria-selected:bg-lf-amber-soft aria-selected:text-lf-ink"
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
                            className="min-h-[44px] rounded-md border border-lf-hairline/45 bg-lf-paper px-3 text-lf-control text-lf-ink outline-none placeholder:text-lf-ink/40 focus:border-lf-amber"
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
                                    <p className="m-0 text-[0.66rem] tracking-tight font-semibold uppercase text-lf-ink/55">
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
                                        <span className="text-xs text-lf-ink-soft">
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
                                    <p className="m-0 text-[0.66rem] tracking-tight font-semibold uppercase text-lf-ink/55">
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
                                        <span className="text-xs text-lf-ink-soft">
                                          {profile.role}
                                        </span>
                                      </MobileContractOptionButton>
                                    ))}
                                  </div>
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
                                  <div className="grid gap-1">
                                    <p className="m-0 text-[0.66rem] tracking-tight font-semibold uppercase text-lf-ink/55">
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
                                    <p className="m-0 text-[0.66rem] tracking-tight font-semibold uppercase text-lf-ink/55">
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
                                  <p className="m-0 text-lf-control leading-relaxed text-lf-ink-soft">
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

                  {props.onlineLutSources && (
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
                          className="grid size-[44px] shrink-0 place-items-center rounded-md border border-lf-hairline/45 bg-lf-paper text-lf-ink/70 transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm hover:text-lf-ink disabled:cursor-not-allowed disabled:opacity-50"
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
                          inputClassName="h-[44px] rounded-md border-lf-hairline/45 bg-lf-paper text-lf-control text-lf-ink shadow-none placeholder:text-lf-ink/40 focus:border-lf-amber focus:ring-lf-amber/20"
                        />
                        <button
                          type="submit"
                          aria-label={t('raw.lutSource.add')}
                          disabled={
                            !props.onlineLutSources.sourceUrlInput.trim()
                          }
                          className="grid size-[44px] shrink-0 place-items-center rounded-md border border-lf-hairline/45 bg-lf-paper text-lf-ink/70 transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm hover:text-lf-ink disabled:cursor-not-allowed disabled:opacity-50"
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
                            className="m-0 rounded-md border border-lf-green-deep/30 bg-lf-green-soft/55 px-2.5 py-2 text-xs font-semibold text-lf-green-deep"
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
                                className="grid gap-1.5 rounded-md bg-lf-paper-warm/55 px-2.5 py-2.5"
                              >
                                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                    <span className="min-w-0 truncate text-lf-control font-semibold text-lf-ink">
                                      {resourceLabel(resource)}
                                    </span>
                                    <span className="shrink-0 rounded-lf-pill border border-lf-hairline/45 bg-lf-paper px-1.5 py-0.5 text-lf-eyebrow font-semibold leading-none text-lf-ink-soft">
                                      {t('raw.mobile.lut.entryCount', {
                                        count: entries.length,
                                      })}
                                    </span>
                                    {isResourceLoading && (
                                      <span
                                        className="shrink-0 rounded-lf-pill border border-lf-green-deep/30 bg-lf-green-soft/55 px-1.5 py-0.5 text-lf-eyebrow font-semibold leading-none text-lf-green-deep"
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
                                      className="grid size-[44px] place-items-center rounded-md border border-lf-hairline/45 bg-lf-paper text-lf-ink/70 transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm hover:text-lf-ink disabled:cursor-not-allowed disabled:opacity-50"
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
                                      className="grid size-[44px] place-items-center rounded-md border border-lf-hairline/45 bg-lf-paper text-lf-ink/70 transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm hover:text-lf-ink"
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
                                  {entries.map((entry) => {
                                    const isEntryLoading =
                                      loadingEntryId === entry.id
                                    const handleLoadEntry = async () => {
                                      if (
                                        loadingEntryId ||
                                        !props.onlineLutSources
                                      ) {
                                        return
                                      }
                                      setLoadingEntryId(entry.id)
                                      await new Promise<void>((resolve) =>
                                        requestAnimationFrame(() => resolve()),
                                      )
                                      try {
                                        await props.onlineLutSources.loadEntry(
                                          entry.id,
                                        )
                                      } catch {
                                        // per-resource issue chip surfaces the failure
                                      } finally {
                                        setLoadingEntryId(null)
                                      }
                                    }
                                    return (
                                      <button
                                        key={entry.id}
                                        type="button"
                                        className="grid min-h-[44px] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-lf-hairline/40 bg-lf-paper px-2.5 py-2 text-left transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={
                                          props.disabled || isEntryLoading
                                        }
                                        aria-busy={isEntryLoading}
                                        aria-label={t(
                                          'raw.mobile.lut.loadEntry',
                                          {
                                            label: entry.title,
                                          },
                                        )}
                                        data-raw-mobile-lut-entry-loading={
                                          isEntryLoading ? 'true' : undefined
                                        }
                                        onClick={() => {
                                          void handleLoadEntry()
                                        }}
                                      >
                                        <span className="min-w-0 truncate text-lf-control font-medium text-lf-ink">
                                          {entry.title}
                                        </span>
                                        {isEntryLoading ? (
                                          <Loader2
                                            aria-hidden="true"
                                            className="size-4 animate-spin text-lf-green-deep motion-reduce:animate-none"
                                          />
                                        ) : (
                                          <span className="text-xs font-semibold text-lf-green-deep">
                                            {t('raw.mobile.lut.load')}
                                          </span>
                                        )}
                                      </button>
                                    )
                                  })}
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
