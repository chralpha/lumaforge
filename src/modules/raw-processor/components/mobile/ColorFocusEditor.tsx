import { CircleDot } from 'lucide-react'
import { m } from 'motion/react'

import { Slider } from '~/components/ui/slider/Slider'
import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import { SHEET_SPRING, TAP_SPRING, useToolMotion } from '../../motion'
import type { ColorValue } from '../tools/ColorTool'
import {
  formatColorValue,
  formatColorValueShort,
  MOBILE_COLOR_FIELDS,
} from './color-fields'

export function ColorFocusEditor(props: {
  color: ColorValue
  focusKey: keyof ColorValue
  onChange: (patch: Partial<ColorValue>) => void
  onPickField: (key: keyof ColorValue) => void
  onCancel: () => void
  onDone: () => void
  onDragChange: (dragging: boolean) => void
  scrubbing?: boolean
}) {
  const { t } = useI18n()
  const { prefersReduced } = useToolMotion()
  const f = MOBILE_COLOR_FIELDS.find((x) => x.key === props.focusKey)
  if (!f) return null
  const v = props.color[props.focusKey]
  const scrub = props.scrubbing ?? false

  const receded = scrub ? 0.16 : 1
  const backdropOpacity = scrub ? 0.45 : 1
  const slideY = prefersReduced ? 0 : 12

  return (
    <m.div
      className="pointer-events-none absolute inset-0 z-40"
      data-color-focus
      data-scrubbing={scrub || undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={SHEET_SPRING}
    >
      <m.div
        className="pointer-events-auto absolute inset-x-0 top-0 z-[41] grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 bg-gradient-to-b from-black/80 via-black/45 to-transparent px-3 pb-3.5 pt-safe-offset-3 text-lf-on-photo-ink"
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
          className="inline-flex min-h-[44px] items-center justify-center rounded-lf-pill border border-lf-on-photo-bord bg-lf-on-photo-bg px-3.5 text-sm font-semibold text-lf-on-photo-ink"
        >
          {t('raw.mobile.focus.cancel')}
        </m.button>
        <div className="grid gap-px text-center">
          <small className="text-[0.6rem] font-bold uppercase tracking-wider text-lf-amber-soft">
            {t(f.labelKey)}
          </small>
          <strong className="text-sm font-semibold tabular-nums">
            {formatColorValue(f.key, v)}
          </strong>
        </div>
        <m.button
          type="button"
          whileTap={{ scale: 0.96 }}
          transition={TAP_SPRING}
          onClick={props.onDone}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lf-pill border border-lf-green-deep/40 bg-lf-green px-3.5 text-sm font-semibold text-lf-on-surface"
        >
          {t('raw.mobile.focus.done')}
        </m.button>
      </m.div>

      <m.div
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 pb-safe-offset-3 text-lf-on-photo-ink"
        initial={{ y: slideY, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: slideY, opacity: 0 }}
        transition={SHEET_SPRING}
      >
        <m.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/92 via-black/65 to-transparent"
          animate={{ opacity: backdropOpacity }}
          transition={{ duration: 0.14 }}
        />
        <div
          data-color-focus-panel
          className="relative grid max-h-[min(38svh,270px)] gap-2.5 overflow-y-auto overscroll-contain px-[18px] pb-[18px] pt-3.5"
        >
          <m.div
            key={formatColorValueShort(f.key, v)}
            initial={prefersReduced ? false : { scale: 0.94, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={TAP_SPRING}
            className="flex items-baseline justify-center gap-1 text-[2.4rem] font-semibold leading-none tabular-nums"
          >
            <span>{formatColorValueShort(f.key, v)}</span>
            {f.unit && (
              <small className="text-sm font-semibold text-lf-on-photo-ink/68">
                {f.unit}
              </small>
            )}
          </m.div>
          <div
            data-testid="color-focus-scrub"
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
            className="flex items-center justify-between px-0.5 text-[0.7rem] tabular-nums text-lf-on-photo-ink/55"
            animate={{ opacity: receded }}
            transition={{ duration: 0.14 }}
          >
            <span>{formatColorValue(f.key, f.min)}</span>
            <button
              type="button"
              onClick={() => props.onChange({ [f.key]: 0 })}
              className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md px-2 transition-colors hover:bg-lf-on-photo-bg-strong hover:text-lf-amber-soft"
            >
              <CircleDot aria-hidden="true" className="size-3" />
              {t('raw.mobile.focus.neutral')}
            </button>
            <span>{formatColorValue(f.key, f.max)}</span>
          </m.div>
          <m.div
            role="tablist"
            aria-label={t('raw.mobile.focus.colorSiblingsAria')}
            animate={{ opacity: receded }}
            transition={{ duration: 0.14 }}
            className="mt-1.5 flex gap-1.5 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {MOBILE_COLOR_FIELDS.filter((o) => o.key !== f.key).map((o) => {
              const ov = props.color[o.key]
              const dirty = ov !== 0
              return (
                <m.button
                  key={o.key}
                  type="button"
                  role="tab"
                  whileTap={{ scale: 0.95 }}
                  transition={TAP_SPRING}
                  onClick={() => props.onPickField(o.key)}
                  className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lf-pill border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-3 py-1.5 text-[0.7rem] font-semibold text-lf-on-photo-ink/82"
                >
                  {t(o.labelKey)}
                  <em
                    className={clsxm(
                      'not-italic tabular-nums',
                      dirty ? 'text-lf-amber-soft' : 'text-lf-on-photo-ink/55',
                    )}
                  >
                    {formatColorValueShort(o.key, ov)}
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
