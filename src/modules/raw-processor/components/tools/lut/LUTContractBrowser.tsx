import type { LUTColorProfile } from '@lumaforge/luma-color-runtime'
import { searchLUTColorProfiles } from '@lumaforge/luma-color-runtime'
import { m } from 'motion/react'
import { useEffect, useId, useMemo, useState } from 'react'

import { Input } from '~/components/ui/input'
import { useScrollEdgeFade } from '~/hooks/common'
import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import { composeLUTContractProfile, groupProfiles } from '../lut-contract'
import {
  SEGMENTED_FOCUS_RING,
  SEGMENTED_ITEM_TEXT,
  SEGMENTED_ITEM_TEXT_ACTIVE,
  SEGMENTED_THUMB_BG,
  SEGMENTED_TRACK,
} from '../segmented-chrome'
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
  browserId,
  initialStep,
  initialInputDraft,
}: {
  open: boolean
  onClose: (options?: { restoreFocus?: boolean }) => void
  suggestions: LUTColorProfile[]
  currentProfile?: LUTColorProfile
  onSelect: (profile: LUTColorProfile) => void
  browserId: string
  initialStep?: 'input' | 'output'
  initialInputDraft?: LUTColorProfile | null
}) {
  const { t } = useI18n()
  const searchInputId = useId()
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null)
  useScrollEdgeFade(listEl, { enabled: open })
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
    setStep(initialStep ?? 'input')
    setDraftInputProfile(initialInputDraft ?? currentProfile ?? null)
  }, [currentProfile, initialInputDraft, initialStep, open])

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
  const currentOutputOption = useMemo(
    () => (currentProfile ? toDeclaredOutputOption(currentProfile) : undefined),
    [currentProfile],
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

  if (!open) return null

  return (
    <LutBrowserDialog
      open={open}
      id={browserId}
      kind="contract"
      className="grid-rows-[auto_auto_auto_minmax(0,1fr)]"
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
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose({ restoreFocus: true })
      }}
    >
      <div
        className={`relative grid grid-cols-2 ${SEGMENTED_TRACK}`}
        role="tablist"
        aria-label={t('raw.lutContract.panels')}
      >
        {(['input', 'output'] as const).map((tabId) => {
          const isActive = step === tabId
          const label =
            tabId === 'input'
              ? t('raw.lutContract.inputTab')
              : t('raw.lutContract.outputTab')
          return (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-state={isActive ? 'active' : 'inactive'}
              className={clsxm(
                'relative z-10 min-h-7 rounded-[5px] px-2 text-[0.74rem]',
                SEGMENTED_ITEM_TEXT,
                SEGMENTED_ITEM_TEXT_ACTIVE,
                SEGMENTED_FOCUS_RING,
              )}
              onClick={() => setStep(tabId)}
            >
              {isActive && (
                <m.span
                  layoutId="lut-contract-tab-indicator"
                  aria-hidden="true"
                  data-lut-contract-thumb
                  className={`absolute inset-0 -z-10 rounded-[5px] ${SEGMENTED_THUMB_BG}`}
                  transition={{
                    type: 'spring',
                    stiffness: 460,
                    damping: 38,
                    mass: 0.6,
                  }}
                />
              )}
              <span className="relative">{label}</span>
            </button>
          )
        })}
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
        inputClassName="h-8 border-transparent bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.04)] text-[0.78rem] text-lf-ink shadow-none placeholder:text-lf-ink/40 focus:border-transparent focus:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.06)] focus:ring-2 focus:ring-lf-green/25"
      />

      <div
        ref={setListEl}
        className="grid min-h-0 content-start gap-2 overflow-y-auto overscroll-contain pr-0.5"
        data-raw-lut="contract-browser-list"
        data-lut-contract-step={step}
      >
        {step === 'input' ? (
          <>
            {visibleSuggestions.length > 0 && (
              <div className="space-y-1">
                <p className="m-0 px-1 text-[0.7rem] font-medium tracking-tight text-lf-ink/50">
                  {t('raw.lutContract.suggestedInput')}
                </p>
                <div className="grid gap-0.5 sm:grid-cols-2">
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
                <p className="m-0 px-1 text-[0.7rem] font-medium tracking-tight text-lf-ink/50">
                  {t('raw.lutContract.groupInput', { group: group.label })}
                </p>
                <div className="grid gap-0.5 sm:grid-cols-2">
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
              <p className="m-0 text-[0.78rem] leading-relaxed text-lf-ink/72">
                {t('raw.lutContract.noInput')}
              </p>
            )}
          </>
        ) : (
          <>
            {suggestedOutputOptions.length > 0 && (
              <div className="space-y-1">
                <p className="m-0 px-1 text-[0.7rem] font-medium tracking-tight text-lf-ink/50">
                  {t('raw.lutContract.suggestedOutput')}
                </p>
                <div className="grid gap-0.5 sm:grid-cols-2">
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
                <p className="m-0 px-1 text-[0.7rem] font-medium tracking-tight text-lf-ink/50">
                  {t('raw.lutContract.groupOutput', { group: group.label })}
                </p>
                <div className="grid gap-0.5 sm:grid-cols-2">
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
              <p className="m-0 text-[0.78rem] leading-relaxed text-lf-ink/72">
                {t('raw.lutContract.noOutput')}
              </p>
            )}
          </>
        )}
      </div>
    </LutBrowserDialog>
  )
}
