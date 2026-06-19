import { z } from 'zod'

import type { Translate } from '~/lib/i18n'

export const ColorValueSchema = z.object({
  userTemperature: z.number().min(-100).max(100),
  userTint: z.number().min(-100).max(100),
  userSaturation: z.number().min(-100).max(100),
  userVibrance: z.number().min(-100).max(100),
})

export type ColorValue = z.infer<typeof ColorValueSchema>

export type ColorField = {
  key: keyof ColorValue
  labelKey: Parameters<Translate>[0]
  short: string
  min: number
  max: number
  step: number
  unit: string
}

export const COLOR_FIELDS: ColorField[] = [
  {
    key: 'userTemperature',
    labelKey: 'raw.color.temperature',
    short: 'TEMP',
    min: -100,
    max: 100,
    step: 1,
    unit: '',
  },
  {
    key: 'userTint',
    labelKey: 'raw.color.tint',
    short: 'TINT',
    min: -100,
    max: 100,
    step: 1,
    unit: '',
  },
  {
    key: 'userSaturation',
    labelKey: 'raw.color.saturation',
    short: 'SAT',
    min: -100,
    max: 100,
    step: 1,
    unit: '',
  },
  {
    key: 'userVibrance',
    labelKey: 'raw.color.vibrance',
    short: 'VIB',
    min: -100,
    max: 100,
    step: 1,
    unit: '',
  },
]

export const COLOR_NEUTRAL: ColorValue = {
  userTemperature: 0,
  userTint: 0,
  userSaturation: 0,
  userVibrance: 0,
}

export function isColorNeutral(value: ColorValue): boolean {
  return COLOR_FIELDS.every((f) => value[f.key] === 0)
}

const sign = (v: number) => (v > 0 ? '+' : '')

export function formatColorValueShort(_key: keyof ColorValue, v: number) {
  const rounded = Math.round(v)
  return `${sign(rounded)}${rounded}`
}

export function formatColorValue(key: keyof ColorValue, v: number) {
  return formatColorValueShort(key, v)
}
