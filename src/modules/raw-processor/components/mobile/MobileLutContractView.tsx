import type { LUTColorProfile } from '@lumaforge/luma-color-runtime'
import type { HTMLMotionProps } from 'motion/react'
import { m } from 'motion/react'
import type { Ref } from 'react'

import { useI18n } from '~/lib/i18n'
import { sheetSpring } from '~/lib/spring'

import type { LUTOutputOption } from '../tools/lut/lut-output-options'
import { LUTOutputOptionButton } from '../tools/lut/LUTOutputOptionButton'
import { LUTProfileButton } from '../tools/lut/LUTProfileButton'
import {
  SEGMENTED_FOCUS_RING,
  SEGMENTED_ITEM_TEXT,
  SEGMENTED_ITEM_TEXT_ACTIVE,
  SEGMENTED_THUMB_BG,
  SEGMENTED_TRACK,
} from '../tools/segmented-chrome'

export type MobileLutContractStep = 'input' | 'output'

type ViewMotion = Pick<HTMLMotionProps<'div'>, 'animate' | 'exit' | 'initial'>

type ProfileGroup = {
  label: string
  items: LUTColorProfile[]
}

type OutputGroup = {
  label: string
  items: LUTOutputOption[]
}

export interface MobileLutContractViewProps {
  bodyRef: Ref<HTMLDivElement>
  viewMotion: ViewMotion
  contractStep: MobileLutContractStep
  onContractStepChange: (step: MobileLutContractStep) => void
  contractQuery: string
  onContractQueryChange: (query: string) => void
  visibleSuggestions: LUTColorProfile[]
  groupedInputProfiles: ProfileGroup[]
  suggestedOutputOptions: LUTOutputOption[]
  groupedOutputOptions: OutputGroup[]
  activeOutputOptionId?: string
  hasInputMatches: boolean
  hasOutputMatches: boolean
  draftInputProfile: LUTColorProfile | null
  onInputSelect: (profile: LUTColorProfile) => void
  onOutputSelect: (option: LUTOutputOption) => void
}

export function MobileLutContractView({
  bodyRef,
  viewMotion,
  contractStep,
  onContractStepChange,
  contractQuery,
  onContractQueryChange,
  visibleSuggestions,
  groupedInputProfiles,
  suggestedOutputOptions,
  groupedOutputOptions,
  activeOutputOptionId,
  hasInputMatches,
  hasOutputMatches,
  draftInputProfile,
  onInputSelect,
  onOutputSelect,
}: MobileLutContractViewProps) {
  const { t } = useI18n()

  return (
    <m.div
      key="contract"
      ref={bodyRef}
      className="grid min-h-0 content-start gap-2.5 overflow-y-auto px-4 pb-5 pt-1"
      {...viewMotion}
      transition={sheetSpring}
    >
      <div
        className={`relative grid grid-cols-2 ${SEGMENTED_TRACK}`}
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
              data-state={isActive ? 'active' : 'inactive'}
              className={[
                'relative z-10 min-h-[44px] rounded-[5px] px-2 text-lf-control transition-colors duration-150',
                SEGMENTED_ITEM_TEXT,
                SEGMENTED_ITEM_TEXT_ACTIVE,
                SEGMENTED_FOCUS_RING,
              ].join(' ')}
              onClick={() => onContractStepChange(tabId)}
            >
              {isActive && (
                <m.span
                  layoutId="mobile-lut-contract-tab-indicator"
                  aria-hidden="true"
                  data-mobile-lut-contract-thumb
                  className={`absolute inset-0 -z-10 rounded-[5px] ${SEGMENTED_THUMB_BG}`}
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
        onChange={(event) => onContractQueryChange(event.currentTarget.value)}
        className="min-h-[44px] rounded-md border border-transparent bg-lf-on-photo-bg px-3 text-lf-control text-lf-on-photo-ink outline-none placeholder:text-lf-on-photo-ink/40 focus:border-transparent focus:bg-lf-on-photo-bg-strong focus:ring-2 focus:ring-lf-green/25"
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
                <h3 className="m-0 px-1 text-[0.7rem] font-medium tracking-tight text-lf-on-photo-ink/50">
                  {t('raw.lutContract.suggestedInput')}
                </h3>
                {visibleSuggestions.map((profile) => (
                  <LUTProfileButton
                    key={profile.id}
                    profile={profile}
                    activeProfileId={draftInputProfile?.id}
                    size="touch"
                    surface="on-photo"
                    ariaLabel={t('raw.lutContract.useInput', {
                      label: profile.label,
                    })}
                    onSelect={onInputSelect}
                  />
                ))}
              </section>
            )}

            {groupedInputProfiles.map((group) => (
              <section key={`input-${group.label}`} className="grid gap-1">
                <h3 className="m-0 px-1 text-[0.7rem] font-medium tracking-tight text-lf-on-photo-ink/50">
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
                    surface="on-photo"
                    ariaLabel={t('raw.lutContract.useInput', {
                      label: profile.label,
                    })}
                    onSelect={onInputSelect}
                  />
                ))}
              </section>
            ))}

            {!hasInputMatches && (
              <p className="m-0 text-lf-control leading-relaxed text-lf-on-photo-ink/64">
                {t('raw.lutContract.noInput')}
              </p>
            )}
          </>
        ) : (
          <>
            {suggestedOutputOptions.length > 0 && (
              <section className="grid gap-1">
                <h3 className="m-0 px-1 text-[0.7rem] font-medium tracking-tight text-lf-on-photo-ink/50">
                  {t('raw.lutContract.suggestedOutput')}
                </h3>
                {suggestedOutputOptions.map((option) => (
                  <LUTOutputOptionButton
                    key={option.id}
                    option={option}
                    activeOptionId={activeOutputOptionId}
                    size="touch"
                    surface="on-photo"
                    onSelect={onOutputSelect}
                  />
                ))}
              </section>
            )}

            {groupedOutputOptions.map((group) => (
              <section key={`output-${group.label}`} className="grid gap-1">
                <h3 className="m-0 px-1 text-[0.7rem] font-medium tracking-tight text-lf-on-photo-ink/50">
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
                    surface="on-photo"
                    onSelect={onOutputSelect}
                  />
                ))}
              </section>
            ))}

            {!hasOutputMatches && (
              <p className="m-0 text-lf-control leading-relaxed text-lf-on-photo-ink/64">
                {t('raw.lutContract.noOutput')}
              </p>
            )}
          </>
        )}
      </div>
    </m.div>
  )
}
