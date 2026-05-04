import { useI18n } from '~/lib/i18n'

import { ToolSection } from './ToolSection'

export function FinishTool({
  presetOptions,
  activePresetId,
  disabled,
  onPresetSelect,
}: {
  presetOptions: Array<{ id: string; name: string }>
  activePresetId: string | null
  disabled: boolean
  onPresetSelect: (id: string) => void
}) {
  const { t } = useI18n()

  return (
    <ToolSection
      title={t('raw.finish.title')}
      eyebrow={t('raw.finish.eyebrow')}
    >
      <div className="raw-finish-grid">
        {presetOptions.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={activePresetId === preset.id}
            disabled={disabled}
            onClick={() => onPresetSelect(preset.id)}
          >
            <span>{preset.name}</span>
          </button>
        ))}
      </div>
      {disabled && <p className="raw-tool-note">{t('raw.finish.empty')}</p>}
    </ToolSection>
  )
}
