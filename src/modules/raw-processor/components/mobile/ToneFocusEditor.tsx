import { CircleDot } from 'lucide-react'
import { m } from 'motion/react'

import { Slider } from '~/components/ui/slider/Slider'
import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import { SHEET_SPRING, TAP_SPRING, useToolMotion } from '../../motion'
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
  scrubbing?: boolean
}) {
  const { t } = useI18n()
  const { prefersReduced } = useToolMotion()
  const f = MOBILE_TONE_FIELDS.find((x) => x.key === props.focusKey)
  if (!f) return null
  const v = props.tone[props.focusKey]
  const scrub = props.scrubbing ?? false

  // While dragging the slider, non-essential chrome recedes so the photo
  // (and the live value) dominate — the design's data-dragging behavior.
  const receded = scrub ? 0.16 : 1
  const slideY = prefersReduced ? 0 : 12

  return (
    <m.div
      className="pointer-events-none absolute inset-0 z-40"
      data-tone-focus
      data-scrubbing={scrub || undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={SHEET_SPRING}
    >
      <m.div
        className="pointer-events-auto absolute inset-x-0 top-0 z-[41] grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 bg-gradient-to-b from-black/85 via-black/55 to-transparent px-3 pb-3.5 pt-safe-offset-3 text-white"
        aria-label={t(f.labelKey)}
        initial={{ y: -slideY, opacity: 0 }}
        animate={{ y: 0, opacity: receded }}
        exit={{ y: -slideY, opacity: 0 }}
        transition={SHEET_SPRING}
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
      </m.div>

      <m.div
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black/95 via-black/70 to-transparent pb-safe-offset-3 text-white"
        initial={{ y: slideY, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: slideY, opacity: 0 }}
        transition={SHEET_SPRING}
      >
        <div className="grid gap-2.5 px-[18px] pb-[18px] pt-3.5">
          <m.div
            key={formatToneValueShort(f.key, v)}
            initial={prefersReduced ? false : { scale: 0.94, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={TAP_SPRING}
            className="flex items-baseline justify-center gap-1 text-[2.4rem] font-semibold leading-none tabular-nums"
          >
            <span>{formatToneValueShort(f.key, v)}</span>
            {f.unit && (
              <small className="text-sm font-semibold text-white/70">
                {f.unit}
              </small>
            )}
          </m.div>
          <div
            data-testid="tone-focus-scrub"
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
          <m.div
            className="flex items-center justify-between px-0.5 text-[0.7rem] tabular-nums text-white/60"
            animate={{ opacity: receded }}
            transition={{ duration: 0.14 }}
          >
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
          </m.div>
          <m.div
            role="tablist"
            aria-label={t('raw.mobile.focus.siblingsAria')}
            animate={{ opacity: receded }}
            transition={{ duration: 0.14 }}
            className="mt-1.5 flex gap-1.5 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {MOBILE_TONE_FIELDS.filter((o) => o.key !== f.key).map((o) => {
              const ov = props.tone[o.key]
              const dirty = ov !== 0
              return (
                <m.button
                  key={o.key}
                  type="button"
                  role="tab"
                  whileTap={{ scale: 0.95 }}
                  transition={TAP_SPRING}
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
                </m.button>
              )
            })}
          </m.div>
        </div>
      </m.div>
    </m.div>
  )
}
