import { RotateCcw } from 'lucide-react'
import { m } from 'motion/react'

import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import { TAP_SPRING } from '../../motion'
import type { ToneValue } from '../tools/ToneTool'
import {
  formatToneValueShort,
  isToneNeutral,
  MOBILE_TONE_FIELDS,
} from './tone-fields'

export function ToneStripPanel(props: {
  tone: ToneValue
  focusKey: keyof ToneValue | null
  onPickField: (key: keyof ToneValue) => void
  onReset: () => void
}) {
  const { t } = useI18n()
  const neutral = isToneNeutral(props.tone)
  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-0.5 pb-1 text-[0.68rem] text-white/70">
        <span>{t('raw.mobile.toneStrip.hint')}</span>
        <button
          type="button"
          onClick={props.onReset}
          disabled={neutral}
          aria-label={t('raw.tone.reset')}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2 py-1 text-[0.66rem] font-semibold text-white/85 transition-colors hover:border-amber-400/50 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw aria-hidden="true" className="size-3" />
          {t('raw.tone.reset')}
        </button>
      </div>
      <div
        role="tablist"
        aria-label={t('raw.mobile.toneStrip.aria')}
        className="flex gap-1.5 overflow-x-auto px-0.5 py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {MOBILE_TONE_FIELDS.map((f) => {
          const v = props.tone[f.key]
          const dirty = v !== 0
          const active = props.focusKey === f.key
          return (
            <m.button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={active}
              whileTap={{ scale: 0.96 }}
              transition={TAP_SPRING}
              onClick={() => props.onPickField(f.key)}
              className={clsxm(
                'grid min-w-[76px] shrink-0 grid-rows-[auto_auto] items-center gap-1 rounded-xl border px-2.5 py-2 text-white transition-colors',
                active
                  ? 'border-amber-400 bg-black/80'
                  : dirty
                    ? 'border-amber-400/40 bg-black/40'
                    : 'border-white/15 bg-black/40',
              )}
            >
              <span
                className={clsxm(
                  'text-[0.62rem] font-semibold uppercase tracking-wide',
                  active || dirty ? 'text-amber-400' : 'text-white/75',
                )}
              >
                {f.short}
              </span>
              <span className="text-base font-semibold leading-none tabular-nums">
                {formatToneValueShort(f.key, v)}
              </span>
            </m.button>
          )
        })}
      </div>
    </div>
  )
}
