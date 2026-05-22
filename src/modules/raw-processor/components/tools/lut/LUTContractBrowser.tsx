import type { LUTColorProfile } from '@lumaforge/luma-color-runtime'
import { searchLUTColorProfiles } from '@lumaforge/luma-color-runtime'
import type { RefObject } from 'react'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'

import { Input } from '~/components/ui/input'
import { useI18n } from '~/lib/i18n'

import { composeLUTContractProfile, groupProfiles } from '../lut-contract'
import type { OnlineLutBrowserLayout } from './lut-browser-layout'
import { getViewportBoundedBrowserLayout } from './lut-browser-layout'
import type { LUTOutputOption } from './lut-output-options'
import {
  dedupeOutputOptions,
  dedupeProfiles,
  groupOutputOptions,
  toDeclaredOutputOption,
  toOutputCarrierProfile,
  toSearchOutputOption,
} from './lut-output-options'
import { LutBrowserDialog } from './LutBrowserDialog'
import { LUTOutputOptionButton } from './LUTOutputOptionButton'
import { LUTProfileButton } from './LUTProfileButton'

type LUTContractBrowserStep = 'input' | 'output'

export function LUTContractBrowser({
  open,
  onClose,
  suggestions,
  currentProfile,
  onSelect,
  triggerRef,
  browserId,
}: {
  open: boolean
  onClose: (options?: { restoreFocus?: boolean }) => void
  suggestions: LUTColorProfile[]
  currentProfile?: LUTColorProfile
  onSelect: (profile: LUTColorProfile) => void
  triggerRef: RefObject<HTMLButtonElement | null>
  browserId: string
}) {
  const { t } = useI18n()
  const searchInputId = useId()
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

    const handleViewportChange = () => {
      updateBrowserLayout()
    }

    const scrollTargets = [
      triggerRef.current?.closest('.raw-tool-surface'),
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

  return (
    <LutBrowserDialog
      open={open}
      layout={browserLayout}
      id={browserId}
      kind="contract"
      className="grid-rows-[auto_auto_auto_minmax(0,1fr)]"
      headingClassName=""
      dialogLabel={t('raw.lutContract.browser')}
      title={t('raw.lutContract.browser')}
      description={
        draftInputProfile
          ? t('raw.lutContract.inputPrefix', {
              label: draftInputProfile.label,
            })
          : t('raw.lutContract.chooseInputOutput')
      }
      closeLabel={t('raw.lutContract.closeBrowser')}
      restoreFocus={() => triggerRef.current?.focus()}
      triggerElement={triggerRef.current}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose({ restoreFocus: true })
      }}
    >
      <div
        className="grid grid-cols-2 gap-1.5"
        role="tablist"
        aria-label={t('raw.lutContract.panels')}
      >
        <button
          type="button"
          role="tab"
          aria-selected={step === 'input'}
          className="min-h-8 rounded-lf-control border border-lf-hairline bg-lf-paper px-2 text-lf-body font-semibold text-lf-ink-soft transition hover:border-lf-green/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lf-green aria-selected:border-lf-green/50 aria-selected:bg-lf-green/10 aria-selected:text-lf-green"
          onClick={() => setStep('input')}
        >
          {t('raw.lutContract.inputTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={step === 'output'}
          className="min-h-8 rounded-lf-control border border-lf-hairline bg-lf-paper px-2 text-lf-body font-semibold text-lf-ink-soft transition hover:border-lf-green/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lf-green aria-selected:border-lf-green/50 aria-selected:bg-lf-green/10 aria-selected:text-lf-green"
          onClick={() => setStep('output')}
        >
          {t('raw.lutContract.outputTab')}
        </button>
      </div>

      <label htmlFor={searchInputId} className="sr-only">
        {t('raw.lutContract.search')}
      </label>
      <Input
        id={searchInputId}
        type="search"
        value={query}
        placeholder={t('raw.lutContract.searchPlaceholder')}
        onChange={(event) => setQuery(event.currentTarget.value)}
        inputClassName="h-8 border-lf-hairline bg-lf-paper text-lf-control text-lf-ink shadow-none placeholder:text-lf-ink-soft/65 focus:border-lf-green focus:ring-lf-green/20"
      />

      <div
        className="grid min-h-0 content-start gap-1.5 overflow-y-auto overscroll-contain pr-0.5"
        data-raw-lut="contract-browser-list"
        data-lut-contract-step={step}
      >
        {step === 'input' ? (
          <>
            {visibleSuggestions.length > 0 && (
              <div className="space-y-1">
                <p className="m-0 text-lf-label font-semibold uppercase text-lf-ink-soft">
                  {t('raw.lutContract.suggestedInput')}
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {visibleSuggestions.map((profile) => (
                    <LUTProfileButton
                      key={profile.id}
                      profile={profile}
                      activeProfileId={draftInputProfile?.id}
                      label={profile.label}
                      ariaLabel={t('raw.lutContract.useInput', {
                        label: profile.label,
                      })}
                      onSelect={handleInputSelect}
                      highlighted
                    />
                  ))}
                </div>
              </div>
            )}

            {groupedInputProfiles.map((group) => (
              <div key={`input-${group.label}`} className="space-y-1">
                <p className="m-0 text-lf-label font-semibold uppercase text-lf-ink-soft">
                  {t('raw.lutContract.groupInput', { group: group.label })}
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {group.items.map((profile) => (
                    <LUTProfileButton
                      key={profile.id}
                      profile={profile}
                      activeProfileId={draftInputProfile?.id}
                      label={profile.label}
                      ariaLabel={t('raw.lutContract.useInput', {
                        label: profile.label,
                      })}
                      onSelect={handleInputSelect}
                    />
                  ))}
                </div>
              </div>
            ))}

            {!hasInputMatches && (
              <p className="m-0 text-lf-body leading-relaxed text-lf-ink-soft">
                {t('raw.lutContract.noInput')}
              </p>
            )}
          </>
        ) : (
          <>
            {suggestedOutputOptions.length > 0 && (
              <div className="space-y-1">
                <p className="m-0 text-lf-label font-semibold uppercase text-lf-ink-soft">
                  {t('raw.lutContract.suggestedOutput')}
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
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
                <p className="m-0 text-lf-label font-semibold uppercase text-lf-ink-soft">
                  {t('raw.lutContract.groupOutput', { group: group.label })}
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
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
              <p className="m-0 text-lf-body leading-relaxed text-lf-ink-soft">
                {t('raw.lutContract.noOutput')}
              </p>
            )}
          </>
        )}
      </div>
    </LutBrowserDialog>
  )
}
