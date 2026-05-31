import { useState } from 'react'

import { SegmentGroup, SegmentItem } from '~/components/ui/segment'
import { useI18n } from '~/lib/i18n'

import type { ColorValue } from './ColorTool'
import { ColorTool } from './ColorTool'
import type { ToneValue } from './ToneTool'
import { ToneTool } from './ToneTool'

type AdjustPanel = 'tone' | 'color'

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
  const [activePanel, setActivePanel] = useState<AdjustPanel>('tone')

  return (
    <div className="grid gap-3">
      <SegmentGroup
        aria-label={t('raw.adjust.title')}
        value={activePanel}
        onValueChanged={(value) => setActivePanel(value as AdjustPanel)}
        disabled={disabled}
        className="h-9 w-full rounded-md bg-[oklch(0.96_0.006_255/0.05)] p-1"
      >
        <SegmentItem
          value="tone"
          label={t('raw.adjust.tone')}
          className="flex-1 text-[0.76rem] font-medium text-lf-on-photo-ink/72 transition-colors duration-150 hover:text-lf-on-photo-ink/92 data-[state=active]:font-semibold data-[state=active]:text-lf-on-photo-ink data-[state=active]:[&_span[data-segment-thumb]]:bg-[oklch(0.96_0.006_255/0.10)] data-[state=active]:[&_span[data-segment-thumb]]:shadow-[inset_0_1px_0_oklch(0.96_0.006_255/0.14)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green/80"
        />
        <SegmentItem
          value="color"
          label={t('raw.adjust.color')}
          className="flex-1 text-[0.76rem] font-medium text-lf-on-photo-ink/72 transition-colors duration-150 hover:text-lf-on-photo-ink/92 data-[state=active]:font-semibold data-[state=active]:text-lf-on-photo-ink data-[state=active]:[&_span[data-segment-thumb]]:bg-[oklch(0.96_0.006_255/0.10)] data-[state=active]:[&_span[data-segment-thumb]]:shadow-[inset_0_1px_0_oklch(0.96_0.006_255/0.14)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green/80"
        />
      </SegmentGroup>
      {activePanel === 'tone' ? (
        <ToneTool
          value={tone}
          disabled={disabled}
          onChange={onToneChange}
          onReset={onToneReset}
        />
      ) : (
        <ColorTool
          value={color}
          disabled={disabled}
          onChange={onColorChange}
          onReset={onColorReset}
        />
      )}
    </div>
  )
}
