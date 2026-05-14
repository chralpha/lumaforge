import type {
  LUTColorProfile,
  LUTProfileResolution,
} from '@lumaforge/luma-color-runtime'

import { useI18n } from '~/lib/i18n'

import type { UseOnlineLutSourcesResult } from '../../../hooks/useOnlineLutSources'
import type { LUTProfileSelectionState } from '../../../model/session'
import { LutDropzone } from '../../Dropzone'
import { ToolSection } from '../ToolSection'
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
    <ToolSection
      title={t('raw.lutContract.title')}
      eyebrow={t('raw.lutContract.eyebrow')}
    >
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
        <p className="raw-tool-note">{t('raw.lutContract.empty')}</p>
      )}
    </ToolSection>
  )
}
