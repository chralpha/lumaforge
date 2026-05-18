import { CircleDot } from 'lucide-react'
import { m } from 'motion/react'

import { Slider } from '~/components/ui/slider/Slider'
import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import { TAP_SPRING } from '../../motion'
import type { ToneValue } from '../tools/ToneTool'
import {
  formatToneValue,
  formatToneValueShort,
  MOBILE_TONE_FIELDS,
} from './tone-fields'

export function ToneFocusEditor(props: {
  tone: ToneValue
  focusKey: keyof ToneValue
  onChange: (patch: Partial<ToneValue>) => void
  onPickField: (key: keyof ToneValue) => void
  onCancel: () => void
  onDone: () => void
  onDragChange: (dragging: boolean) => void
}) {
  const { t } = useI18n()
  const f = MOBILE_TONE_FIELDS.find((x) => x.key === props.focusKey)
  if (!f) return null
  const v = props.tone[props.focusKey]

  return (
    <>
      <div
        className="absolute inset-x-0 top-0 z-[41] grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 bg-gradient-to-b from-black/85 via-black/55 to-transparent px-3 pb-3.5 pt-safe-offset-3 text-white"
        aria-label={t(f.labelKey)}
      >
        <m.button
          type="button"
          whileTap={{ scale: 0.96 }}
          transition={TAP_SPRING}
          onClick={props.onCancel}
          className="h-[38px] rounded-full border border-white/30 bg-black/40 px-3.5 text-sm font-semibold text-white"
        >
          {t('raw.mobile.focus.cancel')}
        </m.button>
        <div className="grid gap-px text-center">
          <small className="text-[0.6rem] font-bold uppercase tracking-wider text-amber-400">
            {t(f.labelKey)}
          </small>
          <strong className="text-sm font-semibold tabular-nums">
            {formatToneValue(f.key, v)}
          </strong>
        </div>
        <m.button
          type="button"
          whileTap={{ scale: 0.96 }}
          transition={TAP_SPRING}
          onClick={props.onDone}
          className="h-[38px] rounded-full border border-accent bg-accent px-3.5 text-sm font-semibold text-background"
        >
          {t('raw.mobile.focus.done')}
        </m.button>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black/95 via-black/70 to-transparent pb-safe-offset-3 text-white">
        <div className="grid gap-2.5 px-[18px] pb-[18px] pt-3.5">
          <div className="flex items-baseline justify-center gap-1 text-[2.4rem] font-semibold leading-none tabular-nums">
            <span>{formatToneValueShort(f.key, v)}</span>
            {f.unit && (
              <small className="text-sm font-semibold text-white/70">
                {f.unit}
              </small>
            )}
          </div>
          <div
            onPointerDown={() => props.onDragChange(true)}
            onPointerUp={() => props.onDragChange(false)}
            onPointerCancel={() => props.onDragChange(false)}
          >
            <Slider
              thumbAriaLabel={t(f.labelKey)}
              value={[v]}
              min={f.min}
              max={f.max}
              step={f.step}
              onValueChange={([nv]) => props.onChange({ [f.key]: nv })}
            />
          </div>
          <div className="flex items-center justify-between px-0.5 text-[0.7rem] tabular-nums text-white/60">
            <span>{formatToneValue(f.key, f.min)}</span>
            <button
              type="button"
              onClick={() => props.onChange({ [f.key]: 0 })}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-black/40 hover:text-amber-400"
            >
              <CircleDot aria-hidden="true" className="size-3" />
              {t('raw.mobile.focus.neutral')}
            </button>
            <span>{formatToneValue(f.key, f.max)}</span>
          </div>
          <div
            role="tablist"
            aria-label={t('raw.mobile.focus.siblingsAria')}
            className="mt-1.5 flex gap-1.5 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {MOBILE_TONE_FIELDS.filter((o) => o.key !== f.key).map((o) => {
              const ov = props.tone[o.key]
              const dirty = ov !== 0
              return (
                <button
                  key={o.key}
                  type="button"
                  role="tab"
                  onClick={() => props.onPickField(o.key)}
                  className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[0.7rem] font-semibold text-white/80"
                >
                  {t(o.labelKey)}
                  <em
                    className={clsxm(
                      'not-italic tabular-nums',
                      dirty ? 'text-amber-400' : 'text-white/60',
                    )}
                  >
                    {formatToneValueShort(o.key, ov)}
                  </em>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
