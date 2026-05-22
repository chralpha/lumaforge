import type {
  LUTColorProfile,
  LUTProfileResolution,
} from '@lumaforge/luma-color-runtime'
import { SlidersHorizontal } from 'lucide-react'
import { useCallback, useId, useRef, useState } from 'react'

import { Button } from '~/components/ui/button'
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
        <p
          className="m-0 rounded-lf-control border border-lf-amber/45 bg-lf-amber/12 px-2.5 py-2 text-lf-body leading-relaxed text-lf-ink-soft"
          data-raw-lut="contract-status"
        >
          {t('raw.lutContract.unsupportedOutput')}
        </p>
      ) : isPending ? (
        <p
          className="m-0 rounded-lf-control border border-lf-amber/45 bg-lf-amber/12 px-2.5 py-2 text-lf-body leading-relaxed text-lf-ink-soft"
          data-raw-lut="contract-status"
        >
          {t('raw.lutContract.unknown')}
        </p>
      ) : resolvedProfile ? (
        <div className="grid min-w-0 gap-2 text-lf-body leading-relaxed text-lf-ink">
          <p className="m-0 grid min-w-0 grid-cols-[4.9rem_minmax(0,1fr)] gap-2">
            <span className="font-semibold text-lf-ink-soft">
              {t('raw.lutContract.inputTerm')}
            </span>
            <span className="min-w-0 break-words font-medium text-lf-ink">
              {resolvedProfile.label}
            </span>
          </p>
          {outputLabel && (
            <p className="m-0 grid min-w-0 grid-cols-[4.9rem_minmax(0,1fr)] gap-2">
              <span className="font-semibold text-lf-ink-soft">
                {t('raw.lutContract.outputTerm')}
              </span>
              <span className="min-w-0 break-words font-medium text-lf-ink">
                {outputLabel}
              </span>
            </p>
          )}
          {needsOutputContract && (
            <p
              className="m-0 rounded-lf-control border border-lf-amber/45 bg-lf-amber/12 px-2.5 py-2 text-lf-body leading-relaxed text-lf-ink-soft"
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
        variant="secondary"
        size="sm"
        className="gap-1.5 [&_svg]:size-3.5"
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
        triggerRef={triggerRef}
        browserId={browserId}
      />
    </div>
  )
}
