import { describe, expect, it } from 'vitest'

import {
  buildBuiltinStyle,
  mapIntensityLevel,
  toCustomStyle,
} from '../services/style-system'

describe('style-system', () => {
  it('builds builtin styles with an input prep profile', () => {
    const style = buildBuiltinStyle('film-soft')

    expect(style.kind).toBe('builtin')
    expect(style.inputPrepProfile?.profileId).toBe('normalized-film-soft')
  })

  it('maps finite intensity levels to blend values', () => {
    expect(mapIntensityLevel('off')).toBe(0)
    expect(mapIntensityLevel('standard')).toBe(0.7)
    expect(mapIntensityLevel('strong')).toBe(1)
  })

  it('adds a best-effort warning to custom LUT styles', () => {
    const style = toCustomStyle({
      title: 'Client LUT',
      size: 33,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      data: new Float32Array(33 * 33 * 33 * 3),
      inputProfile: 'display-srgb',
    })

    expect(style.kind).toBe('custom')
    expect(style.warning).toMatch(/best effort/i)
  })

  it('labels V-Log custom LUT styles with their input profile', () => {
    const style = toCustomStyle({
      title: 'Camera LUT',
      size: 33,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      data: new Float32Array(33 * 33 * 33 * 3),
      inputProfile: 'v-log',
    })

    expect(style.lutAsset?.inputProfile).toBe('v-log')
    expect(style.warning).toMatch(/V-Log input/i)
  })
})
