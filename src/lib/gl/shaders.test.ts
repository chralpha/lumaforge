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
    expect(PROCESS_FRAGMENT_SHADER_U16).not.toContain('precision highp uint')
    expect(PROCESS_FRAGMENT_SHADER_U16).toContain('precision highp usampler2D')
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
        'TRANSFER_BT709',
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
        'TRANSFER_L_LOG',
        'TRANSFER_LINEAR',
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
      expect(shader).not.toContain('u_lutInputProfile')
      expect(shader).not.toContain('LUT_INPUT_V_LOG')
    },
  )

  it.each(PROCESS_SHADER_VARIANTS)(
    '%s variant dispatches L-Log and clamps N-Log decode to avoid NaN',
    (_name, shader) => {
      expect(shader).toContain('const int TRANSFER_L_LOG = 18')
      expect(shader).toContain('float encodeLLog(float linearValue)')
      expect(shader).toContain('float decodeLLog(float encodedValue)')
      expect(shader).toContain(
        'if (transfer == TRANSFER_L_LOG) return encodeLLog(linearValue)',
      )
      expect(shader).toContain(
        'if (transfer == TRANSFER_L_LOG) return decodeLLog(encodedValue)',
      )

      const nLogDecode = shader.match(
        /float decodeNLog\(float encodedValue\) \{[\s\S]*?\n\}/,
      )?.[0]
      expect(nLogDecode).toContain(
        'pow(max((encodedValue - 0.0075) / (650.0 / 1023.0), 0.0), 3.0)',
      )
    },
  )

  it.each(PROCESS_SHADER_VARIANTS)(
    '%s variant treats linear transfer as an explicit no-op',
    (_name, shader) => {
      expect(shader).toContain('const int TRANSFER_LINEAR = 19')
      expect(shader).toContain(
        'if (transfer == TRANSFER_LINEAR) return linearValue',
      )
      expect(shader).toContain(
        'if (transfer == TRANSFER_LINEAR) return encodedValue',
      )
    },
  )

  it.each(PROCESS_SHADER_VARIANTS)(
    '%s variant dispatches BT.709 separately from sRGB and gamma 2.4',
    (_name, shader) => {
      expect(shader).toContain('const int TRANSFER_SRGB = 0')
      expect(shader).toContain('const int TRANSFER_BT709 = 1')
      expect(shader).toContain('const int TRANSFER_GAMMA24 = 2')
      expect(shader).toContain('float encodeBT709(float linearValue)')
      expect(shader).toContain('float decodeBT709(float encodedValue)')
      expect(shader).toContain(
        'if (transfer == TRANSFER_BT709) return encodeBT709(linearValue)',
      )
      expect(shader).toContain(
        'if (transfer == TRANSFER_BT709) return decodeBT709(encodedValue)',
      )
    },
  )

  it.each(PROCESS_SHADER_VARIANTS)(
    '%s variant applies matrix and transfer before scene LUT sampling while keeping display LUT path',
    (_name, shader) => {
      expect(shader).toContain('vec3 applyDisplayLut(vec3 sceneLinearProPhoto)')
      expect(shader).toContain(
        'vec3 applySceneLutToDisplayLinear(vec3 sceneLinearProPhoto)',
      )
      expect(shader).toContain(
        'vec3 applyCombinedOutputLut(vec3 sceneLinearProPhoto)',
      )

      const sceneBranch = shader.match(
        /vec3 applySceneLutToDisplayLinear\(vec3 sceneLinearProPhoto\) \{[\s\S]*?\n\}/,
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
      expect(sceneBranch).not.toContain('linearToSrgb')

      const displayBranch = shader.match(
        /vec3 applyDisplayLut\(vec3 sceneLinearProPhoto\) \{[\s\S]*?\n\}/,
      )?.[0]
      expect(displayBranch).toContain('linearProPhotoToLinearSrgb')
      expect(displayBranch).toContain(
        'encodeTransfer(displayLinear, u_lutInputTransfer)',
      )
      expect(displayBranch).toContain(
        'applySignalRangeForLutInput(lutInputEncoded, u_lutInputRange)',
      )
      expect(displayBranch).toContain(
        'removeSignalRangeFromLutOutput(applyLut(lutInput), u_lutOutputRange)',
      )
      expect(displayBranch).toContain(
        'decodeTransfer(lutOutputEncoded, u_lutOutputTransfer)',
      )
      expect(displayBranch).toContain(
        'return linearToSrgb(displayLinearOutput)',
      )
    },
  )

  it.each(PROCESS_SHADER_VARIANTS)(
    '%s variant mixes scene creative LUT intensity in linear display domain',
    (_name, shader) => {
      const sceneMain = shader.match(
        /if \(u_lutRole == LUT_ROLE_SCENE_CREATIVE\) \{[\s\S]*?\n {4}\}/,
      )?.[0]
      expect(sceneMain).toBeDefined()
      expect(sceneMain).toContain(
        'vec3 styledDisplayLinear = applySceneLutToDisplayLinear(baseSceneLinearProPhoto)',
      )
      expect(sceneMain).toContain(
        'vec3 mixedDisplayLinear = mix(baseDisplayLinear, styledDisplayLinear, intensity)',
      )
      expect(sceneMain).toContain(
        'styledColor = linearToSrgb(mixedDisplayLinear)',
      )
      expect(sceneMain).not.toContain('mix(baseDisplayColor, styledColor')

      expect(shader).toContain(
        'vec3 baseDisplayLinear = linearProPhotoToLinearSrgb(baseSceneLinearProPhoto)',
      )
      expect(shader).toContain('fragColor = vec4(clamp01(styledColor), 1.0)')
    },
  )

  it.each(PROCESS_SHADER_VARIANTS)(
    '%s variant preserves builtin style intensity mixing in display domain',
    (_name, shader) => {
      const builtinMain = shader.match(
        /if \(u_styleKind == STYLE_BUILTIN\) \{[\s\S]*?\n {2}\}/,
      )?.[0]
      expect(builtinMain).toBeDefined()
      expect(builtinMain).toContain(
        'styledColor = mix(baseDisplayColor, applyBuiltinStyle(baseDisplayColor), intensity)',
      )
    },
  )

  it.each(PROCESS_SHADER_VARIANTS)(
    '%s variant keeps display-domain intensity mixing for display and combined-output paths',
    (_name, shader) => {
      expect(shader).toContain(
        'vec3 baseSceneLinearProPhoto = max(readInputSceneLinearProPhoto',
      )
      expect(shader).toContain(
        'styledColor = mix(baseDisplayColor, applyCombinedOutputLut(baseSceneLinearProPhoto), intensity)',
      )
      expect(shader).toContain(
        'styledColor = mix(baseDisplayColor, applyDisplayLut(baseSceneLinearProPhoto), intensity)',
      )
    },
  )

  it.each(PROCESS_SHADER_VARIANTS)(
    '%s variant applies raw render exposure before style and LUT routing',
    (_name, shader) => {
      expect(shader).toContain('uniform float u_rawRenderExposureMultiplier')
      expect(shader).toContain(
        'vec3 baseSceneLinearProPhoto = max(readInputSceneLinearProPhoto(v_texCoord) * u_rawRenderExposureMultiplier, vec3(0.0))',
      )
    },
  )
})
