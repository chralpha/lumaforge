import type { HSLBandId, HSLBandShift } from '@lumaforge/luma-color-runtime'

import type { Translate } from '~/lib/i18n'

import type { HSLToolValue } from '../tools/HSLTool'

/**
 * Documented band order, shared with the desktop HSLTool and the runtime
 * `BAND_IDS_ORDERED` constant. Listed red-to-magenta around the hue wheel.
 */
export const HSL_BAND_ORDER: readonly HSLBandId[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'aqua',
  'blue',
  'purple',
  'magenta',
] as const

export type MobileHSLField = {
  key: keyof HSLBandShift
  labelKey: Parameters<Translate>[0]
  short: string
  min: number
  max: number
  step: number
}

export const MOBILE_HSL_FIELDS: readonly MobileHSLField[] = [
  {
    key: 'hue',
    labelKey: 'raw.hsl.fields.hue',
    short: 'HUE',
    min: -100,
    max: 100,
    step: 1,
  },
  {
    key: 'saturation',
    labelKey: 'raw.hsl.fields.saturation',
    short: 'SAT',
    min: -100,
    max: 100,
    step: 1,
  },
  {
    key: 'lightness',
    labelKey: 'raw.hsl.fields.lightness',
    short: 'LIGHT',
    min: -100,
    max: 100,
    step: 1,
  },
] as const

export const HSL_BAND_LABEL_KEY: Record<HSLBandId, Parameters<Translate>[0]> = {
  red: 'raw.hsl.bands.red',
  orange: 'raw.hsl.bands.orange',
  yellow: 'raw.hsl.bands.yellow',
  green: 'raw.hsl.bands.green',
  aqua: 'raw.hsl.bands.aqua',
  blue: 'raw.hsl.bands.blue',
  purple: 'raw.hsl.bands.purple',
  magenta: 'raw.hsl.bands.magenta',
}

/**
 * On-photo swatch chips that hint at each band's anchor hue on the dark `/raw`
 * surface, matching the desktop HSLTool palette so users see one identity per
 * band across surfaces. Anchors live in OKLch inside the runtime; these are
 * recognition cues only.
 */
export const HSL_BAND_SWATCH: Record<HSLBandId, string> = {
  red: 'oklch(0.62 0.21 27)',
  orange: 'oklch(0.74 0.17 55)',
  yellow: 'oklch(0.86 0.17 95)',
  green: 'oklch(0.74 0.18 145)',
  aqua: 'oklch(0.78 0.13 200)',
  blue: 'oklch(0.62 0.18 260)',
  purple: 'oklch(0.58 0.20 305)',
  magenta: 'oklch(0.66 0.22 340)',
}

const sign = (v: number) => (v > 0 ? '+' : '')

export function formatHSLValueShort(
  _key: keyof HSLBandShift,
  v: number,
): string {
  const rounded = Math.round(v)
  return `${sign(rounded)}${rounded}`
}

export const HSL_NEUTRAL_BAND: Readonly<HSLBandShift> = Object.freeze({
  hue: 0,
  saturation: 0,
  lightness: 0,
})

export function isHSLBandNeutral(band: Readonly<HSLBandShift>): boolean {
  return band.hue === 0 && band.saturation === 0 && band.lightness === 0
}

export function isHSLNeutral(value: HSLToolValue | undefined): boolean {
  if (!value) return true
  return HSL_BAND_ORDER.every((band) => isHSLBandNeutral(value[band]))
}
