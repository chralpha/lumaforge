import type {
  LUTColorProfile,
  LUTProfileResolution,
} from '@lumaforge/luma-color-runtime'

import { useI18n } from '~/lib/i18n'

import type { UseOnlineLutSourcesResult } from '../../../hooks/useOnlineLutSources'
import type { LUTProfileSelectionState } from '../../../model/session'
import { LutDropzone } from '../../Dropzone'
import { LUTProfileStatus } from './LUTProfileStatus'
import { OnlineLutSourceControls } from './OnlineLutSourceControls'

export function LutContractTool({
  currentLutName,
  disabled,
  onLutLoad,
  onLutClear,
  lutProfileSelection,
  lutProfileResolution,
  onLutProfileSelect,
  onlineLutSources,
}: {
  currentLutName?: string | null
  disabled: boolean
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  lutProfileSelection?: LUTProfileSelectionState | null
  lutProfileResolution?: LUTProfileResolution | null
  onLutProfileSelect: (profile: LUTColorProfile) => void
  onlineLutSources?: UseOnlineLutSourcesResult
}) {
  const { t } = useI18n()

  return (
    <div className="grid gap-3">
      {onlineLutSources && (
        <OnlineLutSourceControls onlineLutSources={onlineLutSources} />
      )}
      <LutDropzone
        onFileDrop={onLutLoad}
        currentLut={currentLutName}
        onClear={onLutClear}
        disabled={disabled}
      />
      {currentLutName ? (
        <LUTProfileStatus
          key={lutProfileSelection?.fingerprint ?? currentLutName}
          selection={lutProfileSelection}
          resolution={lutProfileResolution}
          onSelect={onLutProfileSelect}
        />
      ) : (
        <p className="m-0 text-[0.72rem] leading-relaxed text-lf-ink/55">
          {t('raw.lutContract.empty')}
        </p>
      )}
    </div>
  )
}
