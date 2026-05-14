import type {
  LUTColorProfile,
  LUTProfileResolution,
} from '@lumaforge/luma-color-runtime'
import { SlidersHorizontal } from 'lucide-react'
import { useCallback, useId, useRef, useState } from 'react'

import { useI18n } from '~/lib/i18n'

import type { LUTProfileSelectionState } from '../../../model/session'
import { getProfileOutputLabel, getResolvedProfile } from '../lut-contract'
import { LUTContractBrowser } from './LUTContractBrowser'

export function LUTProfileStatus({
  selection,
  resolution,
  onSelect,
}: {
  selection?: LUTProfileSelectionState | null
  resolution?: LUTProfileResolution | null
  onSelect: (profile: LUTColorProfile) => void
}) {
  const { t } = useI18n()
  const resolvedProfile = getResolvedProfile(selection, resolution)
  const outputLabel = getProfileOutputLabel(resolvedProfile)
  const needsOutputContract = outputLabel === 'Output profile required'
  const isPending = selection?.status === 'pending'
  const isUnsupportedOutput =
    resolution?.kind === 'needs-user-selection' &&
    resolution.reason === 'unsupported-output'
  const suggestions =
    selection?.status === 'pending' ? selection.suggestions : []
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
      {isUnsupportedOutput ? (
        <p className="raw-lut-contract-status raw-lut-contract-status-amber">
          {t('raw.lutContract.unsupportedOutput')}
        </p>
      ) : isPending ? (
        <p className="raw-lut-contract-status raw-lut-contract-status-amber">
          {t('raw.lutContract.unknown')}
        </p>
      ) : resolvedProfile ? (
        <div className="raw-lut-contract-facts">
          <p className="raw-lut-contract-fact">
            <span className="raw-lut-contract-term">
              {t('raw.lutContract.inputTerm')}
            </span>
            <span className="raw-lut-contract-value">
              {resolvedProfile.label}
            </span>
          </p>
          {outputLabel && (
            <p className="raw-lut-contract-fact">
              <span className="raw-lut-contract-term">
                {t('raw.lutContract.outputTerm')}
              </span>
              <span className="raw-lut-contract-value">{outputLabel}</span>
            </p>
          )}
          {needsOutputContract && (
            <p className="raw-lut-contract-status raw-lut-contract-status-amber">
              {t('raw.lutContract.needsOutput')}
            </p>
          )}
        </div>
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        className="raw-lut-contract-change-button"
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
      </button>

      <LUTContractBrowser
        open={browserOpen}
        onClose={handleClose}
        suggestions={suggestions}
        currentProfile={resolvedProfile}
        onSelect={onSelect}
        triggerRef={triggerRef}
        browserId={browserId}
      />
    </div>
  )
}
