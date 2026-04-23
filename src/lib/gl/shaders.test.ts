import { describe, expect, it } from 'vitest'

import {
  PREVIEW_OUTPUT_SHADER,
  PROCESS_FRAGMENT_SHADER_FLOAT,
  PROCESS_FRAGMENT_SHADER_U16,
} from './shaders'

const PROCESS_SHADER_VARIANTS = [
  ['float', PROCESS_FRAGMENT_SHADER_FLOAT],
  ['u16', PROCESS_FRAGMENT_SHADER_U16],
] as const

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
  it.each(PROCESS_SHADER_VARIANTS)(
    '%s variant has the shared style path with explicit style uniforms',
    (_name, shader) => {
      expect(shader).toContain('u_styleKind')
      expect(shader).toContain('u_builtinPreset')
      expect(shader).toContain('u_lutInputProfile')
      expect(shader).toContain('STYLE_BUILTIN')
      expect(shader).toContain('STYLE_CUSTOM')
      expect(shader).toContain('u_builtinPreset == 7')
    },
  )

  it('uses a normalized float sampler for legacy RGBA input', () => {
    expect(PROCESS_FRAGMENT_SHADER_FLOAT).toContain(
      'uniform sampler2D u_inputTexture',
    )
    expect(PROCESS_FRAGMENT_SHADER_FLOAT).toContain(
      'return texture(u_inputTexture, uv).rgb',
    )
    expect(PROCESS_FRAGMENT_SHADER_FLOAT).not.toContain(
      'linearProPhotoToDisplaySrgb',
    )
    expect(PROCESS_FRAGMENT_SHADER_FLOAT).not.toContain('usampler2D')
  })

  it('converts RGB16 unsigned integer input in the shader', () => {
    expect(PROCESS_FRAGMENT_SHADER_U16).toContain('precision highp uint')
    expect(PROCESS_FRAGMENT_SHADER_U16).toContain(
      'uniform usampler2D u_inputTexture',
    )
    expect(PROCESS_FRAGMENT_SHADER_U16).toContain(
      'highp uvec3 color = texture(u_inputTexture, uv).rgb',
    )
    expect(PROCESS_FRAGMENT_SHADER_U16).toContain(
      'vec3 linearProPhoto = vec3(color) / 65535.0',
    )
  })

  it('converts RGB16 Linear ProPhoto to display sRGB before style processing', () => {
    expect(PROCESS_FRAGMENT_SHADER_U16).toContain('linearProPhotoToDisplaySrgb')
    expect(PROCESS_FRAGMENT_SHADER_U16).toContain('linearProPhotoToLinearSrgb')
    expect(PROCESS_FRAGMENT_SHADER_U16).toContain(
      'dot(color, vec3(2.034367543, -0.727634474, -0.306733069))',
    )
    expect(PROCESS_FRAGMENT_SHADER_U16).toContain(
      'return linearProPhotoToDisplaySrgb(linearProPhoto)',
    )
  })

  it.each(PROCESS_SHADER_VARIANTS)(
    '%s variant prepares V-Log LUT input before sampling custom LUTs',
    (_name, shader) => {
      expect(shader).toContain('rec709LinearToVGamutLinear')
      expect(shader).toContain('vLogEncodeChannel')
      expect(shader).toContain('prepareLutInput')
    },
  )

  it.each(PROCESS_SHADER_VARIANTS)(
    '%s variant mixes the styled output against the normalized original',
    (_name, shader) => {
      expect(shader).toContain('vec3 baseColor = clamp01(readInputColor')
      expect(shader).toContain('mix(baseColor, styledColor')
    },
  )
})
