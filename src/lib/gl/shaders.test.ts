import { describe, expect, it } from 'vitest'

import { PREVIEW_OUTPUT_SHADER, PROCESS_FRAGMENT_SHADER } from './shaders'

describe('preview output shader', () => {
  it('flips the processed texture vertically for browser display', () => {
    expect(PREVIEW_OUTPUT_SHADER).toContain('1.0 - v_texCoord.y')
  })

  it('does not apply a second display gamma transform', () => {
    expect(PREVIEW_OUTPUT_SHADER).not.toContain('linearToSRGB')
    expect(PREVIEW_OUTPUT_SHADER).not.toContain('u_displayGamma')
  })
})

describe('process shader style path', () => {
  it('has one shared style path with explicit style uniforms', () => {
    expect(PROCESS_FRAGMENT_SHADER).toContain('u_styleKind')
    expect(PROCESS_FRAGMENT_SHADER).toContain('u_builtinPreset')
    expect(PROCESS_FRAGMENT_SHADER).toContain('u_lutInputProfile')
    expect(PROCESS_FRAGMENT_SHADER).toContain('STYLE_BUILTIN')
    expect(PROCESS_FRAGMENT_SHADER).toContain('STYLE_CUSTOM')
  })

  it('prepares V-Log LUT input before sampling custom LUTs', () => {
    expect(PROCESS_FRAGMENT_SHADER).toContain('rec709LinearToVGamutLinear')
    expect(PROCESS_FRAGMENT_SHADER).toContain('vLogEncodeChannel')
    expect(PROCESS_FRAGMENT_SHADER).toContain('prepareLutInput')
  })

  it('mixes the styled output against the normalized original', () => {
    expect(PROCESS_FRAGMENT_SHADER).toContain('mix(baseColor, styledColor')
  })
})
