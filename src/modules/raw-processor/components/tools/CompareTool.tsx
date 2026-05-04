import { RotateCcw } from 'lucide-react'

import { useI18n } from '~/lib/i18n'

import { ToolSection } from './ToolSection'

export function CompareTool({
  disabled,
  onCompareReset,
}: {
  disabled: boolean
  onCompareReset: () => void
}) {
  const { t } = useI18n()

  return (
    <ToolSection
      title={t('raw.compare.title')}
      eyebrow={t('raw.compare.eyebrow')}
    >
      <p className="raw-tool-note">{t('raw.compare.note')}</p>
      <button
        type="button"
        className="raw-tool-reset-button"
        disabled={disabled}
        onClick={onCompareReset}
      >
        <RotateCcw aria-hidden="true" />
        {t('raw.compare.reset')}
      </button>
    </ToolSection>
  )
}
