import { describe, expect, it } from 'vitest'

import {
  LUMA_COLOR_LUT_GLSL,
  LUMA_COLOR_RANGE_GLSL,
  LUMA_COLOR_TONE_GLSL,
  LUMA_COLOR_TRANSFER_GLSL,
  LUT_RANGE_UNIFORMS,
  LUT_ROLE_UNIFORMS,
  LUT_TRANSFER_UNIFORMS,
} from './glsl'
import { TRANSFER_FUNCTIONS } from './log-encoding'

const toGlslConstToken = (key: string) => key.toUpperCase().replace(/-/g, '_')

describe('gLSL color contract surface', () => {
  it('exports a transfer uniform for every transfer function', () => {
    expect(Object.keys(LUT_TRANSFER_UNIFORMS).sort()).toEqual(
      Object.keys(TRANSFER_FUNCTIONS).sort(),
    )
  })

  it('declares every transfer uniform inside the GLSL snippet', () => {
    for (const [transfer, value] of Object.entries(LUT_TRANSFER_UNIFORMS)) {
      const token = transfer.toUpperCase().replace(/-/g, '_')
      expect(LUMA_COLOR_TRANSFER_GLSL).toContain(
        `const int TRANSFER_${token} = ${value};`,
      )
    }
  })

  it('keeps sRGB transfer encoding separate from display output clamping', () => {
    expect(LUMA_COLOR_TRANSFER_GLSL).toContain(
      'float encodeSrgbTransfer(float linearValue)',
    )
    expect(LUMA_COLOR_TRANSFER_GLSL).toContain(
      'float decodeSrgbTransfer(float encodedValue)',
    )
    expect(LUMA_COLOR_TRANSFER_GLSL).toContain(
      'if (transfer == TRANSFER_SRGB) return encodeSrgbTransfer(linearValue)',
    )
    expect(LUMA_COLOR_TRANSFER_GLSL).toContain(
      'if (transfer == TRANSFER_SRGB) return decodeSrgbTransfer(encodedValue)',
    )
    expect(LUMA_COLOR_TRANSFER_GLSL).not.toContain(
      'if (transfer == TRANSFER_SRGB) return linearToSrgb(vec3(linearValue)).r',
    )
    expect(LUMA_COLOR_TRANSFER_GLSL).not.toContain(
      'if (transfer == TRANSFER_SRGB) return srgbToLinear(vec3(encodedValue)).r',
    )
    expect(LUMA_COLOR_TRANSFER_GLSL).not.toContain(
      'float value = max(linearValue, 0.0);\n  if (value <= 0.0031308)',
    )
  })

  it('keeps the BT.709 transfer toe signed for LUT-domain math', () => {
    expect(LUMA_COLOR_TRANSFER_GLSL).toContain(
      'if (linearValue <= 0.018) {\n    return 4.5 * linearValue;',
    )
    expect(LUMA_COLOR_TRANSFER_GLSL).toContain(
      'if (encodedValue <= 0.081) {\n    return encodedValue / 4.5;',
    )
    expect(LUMA_COLOR_TRANSFER_GLSL).not.toContain(
      'float value = max(linearValue, 0.0);\n  if (value <= 0.018)',
    )
    expect(LUMA_COLOR_TRANSFER_GLSL).not.toContain(
      'float value = max(encodedValue, 0.0);\n  if (value <= 0.081)',
    )
  })

  it('keeps log encoders with linear toes signed to match the CPU curves', () => {
    expect(LUMA_COLOR_TRANSFER_GLSL).toContain(
      'return ((linearValue * (171.2102946929 - 95.0)) / 0.01125 + 95.0) / 1023.0;',
    )
    expect(LUMA_COLOR_TRANSFER_GLSL).toContain(
      'return 5.6 * linearValue + 0.125;',
    )
    expect(LUMA_COLOR_TRANSFER_GLSL).not.toContain(
      'float encodeSLog3(float linearValue) {\n  float value = max(linearValue, 0.0);',
    )
    expect(LUMA_COLOR_TRANSFER_GLSL).not.toContain(
      'float vLogEncodeChannel(float linearValue) {\n  float value = max(linearValue, 0.0);',
    )
  })

  it('keeps the N-Log cube-root toe sign-preserving on both encode and decode', () => {
    expect(LUMA_COLOR_TRANSFER_GLSL).toContain(
      'return sign(linearValue) * pow(abs(linearValue), 1.0 / 3.0) * (650.0 / 1023.0) + 0.0075;',
    )
    expect(LUMA_COLOR_TRANSFER_GLSL).toContain('return toe * toe * toe;')
    expect(LUMA_COLOR_TRANSFER_GLSL).not.toContain(
      'float encodeNLog(float linearValue) {\n  float value = max(linearValue, 0.0);',
    )
    expect(LUMA_COLOR_TRANSFER_GLSL).not.toContain(
      'return pow(max((encodedValue - 0.0075) / (650.0 / 1023.0), 0.0), 3.0);',
    )
  })

  it('declares every role uniform value inside the GLSL LUT snippet', () => {
    for (const [role, value] of Object.entries(LUT_ROLE_UNIFORMS)) {
      expect(LUMA_COLOR_LUT_GLSL).toContain(
        `const int LUT_ROLE_${toGlslConstToken(role)} = ${value};`,
      )
    }
  })

  it('declares every range uniform value inside the GLSL range snippet', () => {
    for (const [range, value] of Object.entries(LUT_RANGE_UNIFORMS)) {
      expect(LUMA_COLOR_RANGE_GLSL).toContain(
        `const int LUT_RANGE_${toGlslConstToken(range)} = ${value};`,
      )
    }
  })

  it('documents the app shader ABI referenced by the package LUT GLSL', () => {
    for (const abiName of [
      'u_lutTexture',
      'u_lutSize',
      'u_lutDomainMin',
      'u_lutDomainMax',
      'u_inputToLutGamut',
      'u_lutOutputToDisplayGamut',
      'u_lutInputTransfer',
      'u_lutOutputTransfer',
      'u_lutRole',
      'u_lutInputRange',
      'u_lutOutputRange',
      'linearProPhotoToLinearSrgb',
      'encodeTransfer',
      'decodeTransfer',
      'compressLutInputToDomain',
      'applySignalRangeForLutInput',
      'removeSignalRangeFromLutOutput',
    ]) {
      expect(LUMA_COLOR_LUT_GLSL).toContain(abiName)
    }
  })

  it('exports regional tone GLSL helpers for preview parity', () => {
    expect(LUMA_COLOR_TONE_GLSL).toContain('applyUserRegionalTone')
    expect(LUMA_COLOR_TONE_GLSL).toContain('float highlights')
    expect(LUMA_COLOR_TONE_GLSL).toContain('float shadows')
    expect(LUMA_COLOR_TONE_GLSL).toContain('float whites')
    expect(LUMA_COLOR_TONE_GLSL).toContain('float blacks')
    expect(LUMA_COLOR_TONE_GLSL).toContain('smoothstep')
    expect(LUMA_COLOR_TONE_GLSL).toContain('log2')
  })

  it('compresses above-domain LUT input before texture sampling', () => {
    expect(LUMA_COLOR_LUT_GLSL).toContain(
      'vec3 compressLutInputToDomain(vec3 color)',
    )
    expect(LUMA_COLOR_LUT_GLSL).toContain(
      'isnan(value) || isinf(value) || isnan(span) || isinf(span)',
    )
    expect(LUMA_COLOR_LUT_GLSL).toContain(
      'float peak = max(max(normalizedColor.r, normalizedColor.g), normalizedColor.b)',
    )
    expect(LUMA_COLOR_LUT_GLSL).toContain(
      'float scale = peak > 1.0 ? 1.0 / peak : 1.0',
    )
    expect(LUMA_COLOR_LUT_GLSL).toContain(
      'normalizeLutInputChannel(domainColor.r, u_lutDomainMin.r, u_lutDomainMax.r)',
    )
    expect(LUMA_COLOR_LUT_GLSL).toContain(
      'vec3 lutTextureCoordinate(vec3 normalizedColor)',
    )
    expect(LUMA_COLOR_LUT_GLSL).toContain(
      '(normalizedColor * (size - 1.0) + vec3(0.5)) / size',
    )
    expect(LUMA_COLOR_LUT_GLSL).toContain(
      'texture(u_lutTexture, lutTextureCoordinate(normalizedColor)).rgb',
    )
    expect(LUMA_COLOR_LUT_GLSL).toContain('compressLutInputToDomain(color)')
  })
})
