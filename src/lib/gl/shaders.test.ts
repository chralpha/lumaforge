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
      'return srgbToLinear(texture(u_inputTexture, uv).rgb)',
    )
    const inputReader = PROCESS_FRAGMENT_SHADER_FLOAT.match(
      /vec3 readInputSceneLinearProPhoto\(vec2 uv\) \{[\s\S]*?\n\}/,
    )?.[0]
    expect(inputReader).not.toContain('linearProPhotoToDisplaySrgb')
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

  it('keeps RGB16 input in Linear ProPhoto until the style branch chooses a domain', () => {
    expect(PROCESS_FRAGMENT_SHADER_U16).toContain(
      'vec3 readInputSceneLinearProPhoto(vec2 uv)',
    )
    expect(PROCESS_FRAGMENT_SHADER_U16).toContain('linearProPhotoToLinearSrgb')
    expect(PROCESS_FRAGMENT_SHADER_U16).toContain(
      'dot(color, vec3(2.034367543, -0.727634474, -0.306733069))',
    )

    const inputReader = PROCESS_FRAGMENT_SHADER_U16.match(
      /vec3 readInputSceneLinearProPhoto\(vec2 uv\) \{[\s\S]*?\n\}/,
    )?.[0]
    expect(inputReader).toContain('return linearProPhoto')
    expect(inputReader).not.toContain('linearProPhotoToDisplaySrgb')
    expect(inputReader).not.toContain('linearProPhotoToLinearSrgb')
  })

  it.each(PROCESS_SHADER_VARIANTS)(
    '%s variant declares scene-referred LUT profile uniforms',
    (_name, shader) => {
      expect(shader).toContain('uniform mat3 u_inputToLutGamut')
      expect(shader).toContain('uniform mat3 u_lutOutputToDisplayGamut')
      expect(shader).toContain('uniform int u_lutInputTransfer')
      expect(shader).toContain('uniform int u_lutOutputTransfer')
      expect(shader).toContain('uniform int u_lutRole')
      expect(shader).toContain('uniform int u_lutInputRange')
      expect(shader).toContain('uniform int u_lutOutputRange')
    },
  )

  it.each(PROCESS_SHADER_VARIANTS)(
    '%s variant has Tier 1 transfer enum cases without a V-Gamut-only LUT path',
    (_name, shader) => {
      for (const transferConst of [
        'TRANSFER_SRGB',
        'TRANSFER_GAMMA24',
        'TRANSFER_S_LOG2',
        'TRANSFER_S_LOG3',
        'TRANSFER_CANON_LOG',
        'TRANSFER_CANON_LOG2',
        'TRANSFER_CANON_LOG3',
        'TRANSFER_N_LOG',
        'TRANSFER_F_LOG',
        'TRANSFER_F_LOG2',
        'TRANSFER_F_LOG2C',
        'TRANSFER_V_LOG',
        'TRANSFER_LOGC3',
        'TRANSFER_LOGC4',
        'TRANSFER_LOG3G10',
        'TRANSFER_ACESCC',
        'TRANSFER_ACESCCT',
      ]) {
        expect(shader).toContain(transferConst)
      }

      expect(shader).toContain(
        'vec3 encodeTransfer(vec3 linearColor, int transfer)',
      )
      expect(shader).toContain(
        'vec3 decodeTransfer(vec3 encodedColor, int transfer)',
      )
      expect(shader).not.toContain('rec709LinearToVGamutLinear')
      expect(shader).not.toContain('u_lutInputProfile == LUT_INPUT_V_LOG')
    },
  )

  it.each(PROCESS_SHADER_VARIANTS)(
    '%s variant applies matrix and transfer before scene LUT sampling while keeping display LUT path',
    (_name, shader) => {
      expect(shader).toContain('vec3 applyDisplayLut(vec3 sceneLinearProPhoto)')
      expect(shader).toContain('vec3 applySceneLut(vec3 sceneLinearProPhoto)')
      expect(shader).toContain(
        'vec3 applyCombinedOutputLut(vec3 sceneLinearProPhoto)',
      )

      const sceneBranch = shader.match(
        /vec3 applySceneLut\(vec3 sceneLinearProPhoto\) \{[\s\S]*?\n\}/,
      )?.[0]
      expect(sceneBranch).toBeDefined()
      expect(
        sceneBranch!.indexOf('u_inputToLutGamut * sceneLinearProPhoto'),
      ).toBeLessThan(sceneBranch!.indexOf('encodeTransfer'))
      expect(sceneBranch!.indexOf('encodeTransfer')).toBeLessThan(
        sceneBranch!.indexOf('applyLut'),
      )
      expect(sceneBranch).toContain(
        'u_lutOutputToDisplayGamut * lutOutputLinear',
      )

      const displayBranch = shader.match(
        /vec3 applyDisplayLut\(vec3 sceneLinearProPhoto\) \{[\s\S]*?\n\}/,
      )?.[0]
      expect(displayBranch).toContain('linearProPhotoToDisplaySrgb')
      expect(displayBranch).toContain('applyLut(displayColor)')
      expect(shader).toContain('mix(baseDisplayColor, styledColor, intensity)')
    },
  )

  it.each(PROCESS_SHADER_VARIANTS)(
    '%s variant mixes the styled output against the normalized original',
    (_name, shader) => {
      expect(shader).toContain(
        'vec3 baseSceneLinearProPhoto = max(readInputSceneLinearProPhoto',
      )
      expect(shader).toContain('mix(baseDisplayColor, styledColor')
    },
  )
})
