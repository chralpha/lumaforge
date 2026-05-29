import type {
  LUTColorProfile,
  LUTContractResolution,
} from '@lumaforge/luma-color-runtime'
import { SlidersHorizontal } from 'lucide-react'
import { useCallback, useId, useRef, useState } from 'react'

import { Button } from '~/components/ui/button'
import { useI18n } from '~/lib/i18n'

import type { LUTContractSelectionState } from '../../../model/session'
import {
  getContractAttentionState,
  getProfileOutputLabel,
  getResolvedProfile,
} from '../lut-contract'
import { LUTContractBrowser } from './LUTContractBrowser'

export function LUTProfileStatus({
  selection,
  resolution,
  onSelect,
}: {
  selection?: LUTContractSelectionState | null
  resolution?: LUTContractResolution | null
  onSelect: (profile: LUTColorProfile) => void
}) {
  const { t } = useI18n()
  const resolvedProfile = getResolvedProfile(selection, resolution)
  const outputLabel = getProfileOutputLabel(resolvedProfile)
  const attention = getContractAttentionState(selection, resolution)
  const isPending = selection?.status === 'pending'
  const suggestions =
    selection?.status === 'pending' ? selection.recommendations : []
  const [browserOpen, setBrowserOpen] = useState(false)
  const browserId = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const handleClose = useCallback((options?: { restoreFocus?: boolean }) => {
    setBrowserOpen(false)

    if (options?.restoreFocus) {
      queueMicrotask(() => triggerRef.current?.focus())
    }
  }, [])

  if (!selection && !resolution) return null

  return (
    <div className="space-y-2 pt-1">
      {attention.unsupportedOutput ? (
        <p
          className="m-0 inline-flex w-full items-start gap-2 rounded-md bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.10)] px-2.5 py-2 text-lf-body leading-relaxed text-lf-ink/80"
          data-raw-lut="contract-status"
        >
          {t('raw.lutContract.unsupportedOutput')}
        </p>
      ) : isPending ? (
        <p
          className="m-0 inline-flex w-full items-start gap-2 rounded-md bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.10)] px-2.5 py-2 text-lf-body leading-relaxed text-lf-ink/80"
          data-raw-lut="contract-status"
        >
          {t('raw.lutContract.unknown')}
        </p>
      ) : resolvedProfile ? (
        <div className="grid min-w-0 gap-1.5 text-[0.78rem] leading-snug">
          <p className="m-0 grid min-w-0 grid-cols-[4.2rem_minmax(0,1fr)] items-baseline gap-2">
            <span className="text-[0.72rem] tracking-tight text-lf-ink/62">
              {t('raw.lutContract.inputTerm')}
            </span>
            <span className="min-w-0 break-words font-medium text-lf-ink/85">
              {resolvedProfile.label}
            </span>
          </p>
          {outputLabel && (
            <p className="m-0 grid min-w-0 grid-cols-[4.2rem_minmax(0,1fr)] items-baseline gap-2">
              <span className="text-[0.72rem] tracking-tight text-lf-ink/62">
                {t('raw.lutContract.outputTerm')}
              </span>
              <span className="min-w-0 break-words font-medium text-lf-ink/85">
                {outputLabel}
              </span>
            </p>
          )}
          {attention.needsOutputContract && (
            <p
              className="m-0 inline-flex w-full items-start gap-2 rounded-md bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.10)] px-2.5 py-2 text-lf-body leading-relaxed text-lf-ink/80"
              data-raw-lut="contract-status"
            >
              {t('raw.lutContract.needsOutput')}
            </p>
          )}
        </div>
      ) : null}

      <Button
        ref={triggerRef}
        type="button"
        variant="light"
        size="sm"
        className="self-start [&_svg]:size-3.5"
        data-raw-lut="contract-change-button"
        aria-controls={browserId}
        aria-expanded={browserOpen}
        aria-haspopup="dialog"
        onClick={() => {
          if (browserOpen) {
            handleClose({ restoreFocus: true })
          } else {
            setBrowserOpen(true)
          }
        }}
      >
        <SlidersHorizontal aria-hidden="true" />
        {t('raw.lutContract.change')}
      </Button>

      <LUTContractBrowser
        open={browserOpen}
        onClose={handleClose}
        suggestions={suggestions}
        currentProfile={resolvedProfile}
        onSelect={onSelect}
        browserId={browserId}
      />
    </div>
  )
}
