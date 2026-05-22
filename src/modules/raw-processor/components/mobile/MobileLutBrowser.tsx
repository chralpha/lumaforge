import type {
  LUTColorProfile,
  LUTProfileResolution,
} from '@lumaforge/luma-color-runtime'
import { searchLUTColorProfiles } from '@lumaforge/luma-color-runtime'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertTriangle, Check, SlidersHorizontal, X } from 'lucide-react'
import { AnimatePresence, m, useDragControls } from 'motion/react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { IconButton } from '~/components/ui/button'
import { Dialog } from '~/components/ui/dialog'
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
        'grid min-w-0 gap-1 rounded-md border px-2.5 py-2 text-left text-sm transition-colors',
        active
          ? 'border-accent bg-accent/15 text-white'
          : highlighted
            ? 'border-amber-400/45 bg-amber-400/12 text-white'
            : 'border-white/15 bg-black/35 text-white/82 hover:border-amber-400/40 hover:text-white',
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
    <span
      className={[
        'inline-flex min-h-7 min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-[0.68rem] font-semibold',
        tone === 'warning'
          ? 'border-amber-400/45 bg-amber-400/12 text-amber-200'
          : 'border-white/18 bg-black/35 text-white/86',
      ].join(' ')}
    >
      {tone === 'warning' ? (
        <AlertTriangle aria-hidden="true" className="size-3 shrink-0" />
      ) : (
        <Check aria-hidden="true" className="size-3 shrink-0" />
      )}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  )
}

export function MobileLutBrowser(props: MobileLutBrowserProps) {
  const { t } = useI18n()
  const { prefersReduced } = useToolMotion()
  const dragControls = useDragControls()
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
                className="absolute inset-x-0 bottom-0 z-[46] grid max-h-[82%] grid-rows-[auto_minmax(0,1fr)] rounded-t-lf-panel border-t border-lf-on-photo-bord bg-lf-dark pb-safe-offset-3 text-white shadow-lf-popover"
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
                    className="mx-auto h-1 w-9 rounded-full bg-text/30"
                  />
                  <div className="flex items-center justify-between gap-2.5">
                    <DialogPrimitive.Title asChild>
                      <h2 className="m-0 text-base font-semibold">
                        {t('raw.mobile.lut.title')}
                      </h2>
                    </DialogPrimitive.Title>
                    <IconButton
                      icon={X}
                      size="md"
                      aria-label={t('raw.mobile.lut.close')}
                      onClick={props.onClose}
                      className="size-11 rounded-md border border-white/25 bg-black/35 text-white [&_svg]:size-5 [&_svg]:stroke-white"
                    />
                  </div>
                </div>

                <div
                  ref={sheetBodyRef}
                  className="grid min-h-0 gap-[18px] overflow-y-auto px-4 pb-5 pt-1"
                >
                  <section className="grid gap-2.5">
                    <h3 className="m-0 text-sm font-semibold text-white">
                      {t('raw.mobile.lut.currentHeading')}
                    </h3>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-white/15 bg-black/35 p-3">
                      <span className="min-w-0 truncate text-sm font-semibold text-white">
                        {props.currentLutName ?? '—'}
                      </span>
                      <button
                        type="button"
                        className="rounded-md border border-white/20 bg-black/35 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:border-amber-400/50 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
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
                        <h3 className="m-0 text-sm font-semibold text-white">
                          {t('raw.mobile.lut.contractHeading')}
                        </h3>
                        <span
                          className={[
                            'rounded-full border px-2 py-0.5 text-[0.64rem] font-semibold',
                            contractNeedsAttention
                              ? 'border-amber-400/40 bg-amber-400/12 text-amber-200'
                              : 'border-accent/35 bg-accent/12 text-accent',
                          ].join(' ')}
                        >
                          {contractNeedsAttention
                            ? t('raw.mobile.lut.contractNeedsReview')
                            : t('raw.mobile.lut.contractResolved')}
                        </span>
                      </div>

                      <div className="grid gap-2.5 rounded-xl border border-white/15 bg-black/35 p-3">
                        {needsUserSelection ? (
                          <p className="m-0 rounded-md border border-amber-400/35 bg-amber-400/10 px-2.5 py-2 text-xs leading-relaxed text-amber-100">
                            {unsupportedOutput
                              ? t('raw.lutContract.unsupportedOutput')
                              : t('raw.lutContract.unknown')}
                          </p>
                        ) : resolvedProfile ? (
                          <div className="grid gap-2">
                            <div className="grid gap-1">
                              <span className="text-[0.64rem] font-semibold uppercase text-white/48">
                                {t('raw.lutContract.inputTerm')}
                              </span>
                              <ContractChip label={resolvedProfile.label} />
                            </div>
                            <div className="grid gap-1">
                              <span className="text-[0.64rem] font-semibold uppercase text-white/48">
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
                              <p className="m-0 rounded-md border border-amber-400/35 bg-amber-400/10 px-2.5 py-2 text-xs leading-relaxed text-amber-100">
                                {t('raw.lutContract.needsOutput')}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="m-0 text-xs leading-relaxed text-white/68">
                            {t('raw.mobile.lut.noContract')}
                          </p>
                        )}

                        <button
                          type="button"
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-amber-400/35 bg-amber-400/12 px-3 text-sm font-semibold text-amber-100 transition-colors hover:border-amber-300/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
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
                        <div className="grid gap-2.5 rounded-xl border border-white/15 bg-black/42 p-3">
                          <div
                            className="grid grid-cols-2 gap-1.5"
                            role="tablist"
                            aria-label={t('raw.lutContract.panels')}
                          >
                            <button
                              type="button"
                              role="tab"
                              aria-selected={contractStep === 'input'}
                              className="min-h-9 rounded-md border border-white/15 bg-black/35 px-2 text-sm font-semibold text-white/68 transition-colors aria-selected:border-amber-400/45 aria-selected:bg-amber-400/12 aria-selected:text-amber-100"
                              onClick={() => setContractStep('input')}
                            >
                              {t('raw.lutContract.inputTab')}
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={contractStep === 'output'}
                              className="min-h-9 rounded-md border border-white/15 bg-black/35 px-2 text-sm font-semibold text-white/68 transition-colors aria-selected:border-amber-400/45 aria-selected:bg-amber-400/12 aria-selected:text-amber-100"
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
                            className="min-h-10 rounded-md border border-white/18 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-white/42 focus:border-amber-400/55"
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
                                    <p className="m-0 text-[0.64rem] font-semibold uppercase text-white/48">
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
                                        <span className="text-xs text-white/58">
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
                                    <p className="m-0 text-[0.64rem] font-semibold uppercase text-white/48">
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
                                        <span className="text-xs text-white/58">
                                          {profile.role}
                                        </span>
                                      </MobileContractOptionButton>
                                    ))}
                                  </div>
                                ))}

                                {!hasInputMatches && (
                                  <p className="m-0 text-sm leading-relaxed text-white/68">
                                    {t('raw.lutContract.noInput')}
                                  </p>
                                )}
                              </>
                            ) : (
                              <>
                                {suggestedOutputOptions.length > 0 && (
                                  <div className="grid gap-1">
                                    <p className="m-0 text-[0.64rem] font-semibold uppercase text-white/48">
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
                                    <p className="m-0 text-[0.64rem] font-semibold uppercase text-white/48">
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
                                  <p className="m-0 text-sm leading-relaxed text-white/68">
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
                    <h3 className="m-0 text-sm font-semibold text-white">
                      {t('raw.mobile.lut.uploadHeading')}
                    </h3>
                    <Dropzone
                      onFileDrop={props.onLutLoad}
                      accept={['.cube']}
                      multiple
                      disabled={props.disabled}
                      aria-label={t('raw.mobile.lut.uploadAria')}
                      className="grid min-h-20 place-items-center border-white/20 bg-black/35 px-3 py-4 text-center"
                      interactiveMotion={false}
                    >
                      <div className="grid gap-1">
                        <span className="text-sm font-semibold text-white">
                          {t('raw.mobile.lut.uploadTitle')}
                        </span>
                        <span className="text-xs text-white/70">
                          {t('raw.mobile.lut.uploadHint')}
                        </span>
                      </div>
                    </Dropzone>
                  </section>

                  {props.onlineLutSources && (
                    <section className="grid gap-2.5">
                      <h3 className="m-0 text-sm font-semibold text-white">
                        {t('raw.mobile.lut.onlineHeading')}
                      </h3>
                      <div
                        className="grid gap-2"
                        aria-busy={props.onlineLutSources.state.isLoading}
                      >
                        {props.onlineLutSources.state.isLoading && (
                          <p
                            className="m-0 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-2 text-xs font-semibold text-accent"
                            role="status"
                          >
                            {t('raw.mobile.lut.loading')}
                          </p>
                        )}
                        {props.onlineLutSources.state.resources.map(
                          (resource) => {
                            const entries =
                              entriesByResourceId.get(resource.id) ?? []

                            return (
                              <div
                                key={resource.id}
                                className="grid gap-1.5 rounded-xl border border-white/15 bg-black/35 p-2.5"
                              >
                                <div className="flex min-w-0 items-center justify-between gap-2">
                                  <span className="min-w-0 truncate text-sm font-semibold text-white">
                                    {resourceLabel(resource)}
                                  </span>
                                  <span className="shrink-0 rounded-full border border-white/20 bg-black/35 px-1.5 py-0.5 text-[0.64rem] font-semibold leading-none text-white/70">
                                    {t('raw.mobile.lut.entryCount', {
                                      count: entries.length,
                                    })}
                                  </span>
                                </div>
                                <div className="grid gap-1.5">
                                  {entries.map((entry) => (
                                    <button
                                      key={entry.id}
                                      type="button"
                                      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-white/15 bg-black/25 px-2.5 py-2 text-left transition-colors hover:border-amber-400/40 disabled:cursor-not-allowed disabled:opacity-50"
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
                                      <span className="min-w-0 truncate text-sm font-medium text-white">
                                        {entry.title}
                                      </span>
                                      <span className="text-xs font-semibold text-amber-400">
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
