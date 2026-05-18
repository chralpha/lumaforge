import type { Translate } from '~/lib/i18n'

import type { ToneValue } from '../tools/ToneTool'

export type MobileToneField = {
  key: keyof ToneValue
  labelKey: Parameters<Translate>[0]
  short: string
  min: number
  max: number
  step: number
  unit: string
}

export const MOBILE_TONE_FIELDS: MobileToneField[] = [
  {
    key: 'userExposureEv',
    labelKey: 'raw.tone.exposure',
    short: 'EXP',
    min: -5,
    max: 5,
    step: 0.01,
    unit: 'EV',
  },
  {
    key: 'userContrast',
    labelKey: 'raw.tone.contrast',
    short: 'CON',
    min: -100,
    max: 100,
    step: 1,
    unit: '',
  },
  {
    key: 'userHighlights',
    labelKey: 'raw.tone.highlights',
    short: 'HIGH',
    min: -100,
    max: 100,
    step: 1,
    unit: '',
  },
  {
    key: 'userShadows',
    labelKey: 'raw.tone.shadows',
    short: 'SHAD',
    min: -100,
    max: 100,
    step: 1,
    unit: '',
  },
  {
    key: 'userWhites',
    labelKey: 'raw.tone.whites',
    short: 'WHT',
    min: -100,
    max: 100,
    step: 1,
    unit: '',
  },
  {
    key: 'userBlacks',
    labelKey: 'raw.tone.blacks',
    short: 'BLK',
    min: -100,
    max: 100,
    step: 1,
    unit: '',
  },
]

const sign = (v: number) => (v > 0 ? '+' : '')

export function formatToneValueShort(key: keyof ToneValue, v: number): string {
  if (key === 'userExposureEv') return `${sign(v)}${v.toFixed(2)}`
  return `${sign(v)}${Math.round(v)}`
}

export function formatToneValue(key: keyof ToneValue, v: number): string {
  if (key === 'userExposureEv') return `${formatToneValueShort(key, v)} EV`
  return formatToneValueShort(key, v)
}

export const TONE_NEUTRAL: ToneValue = {
  userExposureEv: 0,
  userContrast: 0,
  userHighlights: 0,
  userShadows: 0,
  userWhites: 0,
  userBlacks: 0,
}

export function isToneNeutral(value: ToneValue): boolean {
  return MOBILE_TONE_FIELDS.every((f) => value[f.key] === 0)
}
