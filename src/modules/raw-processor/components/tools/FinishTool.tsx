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
  return (
    <ToolSection title="Finish" eyebrow="Look">
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
      {disabled && (
        <p className="raw-tool-note">Choose a RAW to activate looks.</p>
      )}
    </ToolSection>
  )
}
