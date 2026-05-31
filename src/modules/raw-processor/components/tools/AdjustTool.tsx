import { useI18n } from '~/lib/i18n'

import type { ColorValue } from './ColorTool'
import { ColorTool } from './ColorTool'
import type { ToneValue } from './ToneTool'
import { ToneTool } from './ToneTool'

export function AdjustTool({
  tone,
  color,
  disabled,
  onToneChange,
  onToneReset,
  onColorChange,
  onColorReset,
}: {
  tone: ToneValue
  color: ColorValue
  disabled: boolean
  onToneChange: (value: Partial<ToneValue>) => void
  onToneReset: () => void
  onColorChange: (value: Partial<ColorValue>) => void
  onColorReset: () => void
}) {
  const { t } = useI18n()

  return (
    <div className="grid gap-5">
      <section aria-label={t('raw.adjust.tone')} className="grid gap-3">
        <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.04em] text-lf-on-surface/58">
          {t('raw.adjust.tone')}
        </h3>
        <ToneTool
          value={tone}
          disabled={disabled}
          onChange={onToneChange}
          onReset={onToneReset}
        />
      </section>
      <section
        aria-label={t('raw.adjust.color')}
        className="grid gap-3 border-t border-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.10)] pt-4"
      >
        <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.04em] text-lf-on-surface/58">
          {t('raw.adjust.color')}
        </h3>
        <ColorTool
          value={color}
          disabled={disabled}
          onChange={onColorChange}
          onReset={onColorReset}
        />
      </section>
    </div>
  )
}
