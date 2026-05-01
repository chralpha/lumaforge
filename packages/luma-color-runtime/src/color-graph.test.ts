import { describe, expect, it } from 'vitest'

import { resolveExportColorGraph } from './color-graph'
import { getLUTColorProfile } from './registry'

describe('resolveExportColorGraph', () => {
  it('resolves no-lut export to linear ProPhoto then sRGB output', () => {
    const graph = resolveExportColorGraph({
      styleKind: 'none',
      intensity: 0.7,
      builtinPreset: null,
      lut: null,
    })

    expect(graph.supported).toBe(true)
    if (!graph.supported) {
      throw new Error('Expected supported graph')
    }
    expect(graph.outputGamut).toBe('srgb-rec709')
    expect(graph.outputTransfer).toBe('srgb')
    expect(graph.steps.map((step) => step.kind)).toEqual([
      'input-linear-prophoto',
      'raw-render-exposure',
      'user-exposure',
      'user-contrast',
      'output-srgb',
    ])
    expect(graph.steps[1]).toMatchObject({
      kind: 'raw-render-exposure',
      ev: 0,
      multiplier: 1,
    })
  })

  it('inserts raw render exposure before output conversion', () => {
    const graph = resolveExportColorGraph({
      styleKind: 'none',
      intensity: 0.7,
      builtinPreset: null,
      lut: null,
      rawRenderExposure: { ev: 1, multiplier: 2, source: 'image-statistics' },
    })

    expect(graph).toMatchObject({
      supported: true,
      steps: [
        { kind: 'input-linear-prophoto' },
        { kind: 'raw-render-exposure', ev: 1, multiplier: 2 },
        { kind: 'user-exposure', ev: 0, multiplier: 1 },
        { kind: 'user-contrast', amount: 0, factor: 1 },
        { kind: 'output-srgb' },
      ],
    })
  })

  it('inserts neutral user tone steps in no-lut export graphs', () => {
    const graph = resolveExportColorGraph({
      styleKind: 'none',
      intensity: 0.7,
      builtinPreset: null,
      lut: null,
    })

    expect(graph.supported).toBe(true)
    if (!graph.supported) throw new Error('Expected supported graph')
    expect(graph.steps.map((step) => step.kind)).toEqual([
      'input-linear-prophoto',
      'raw-render-exposure',
      'user-exposure',
      'user-contrast',
      'output-srgb',
    ])
    expect(graph.steps[2]).toMatchObject({
      kind: 'user-exposure',
      ev: 0,
      multiplier: 1,
    })
    expect(graph.steps[3]).toMatchObject({
      kind: 'user-contrast',
      amount: 0,
      factor: 1,
      pivot: 0.18,
      operator: 'linear-prophoto-luminance-scale',
      luminanceCoefficients: [0.2880402, 0.7118741, 0.0000857],
      zeroLuminanceMode: 'return-black',
    })
  })

  it('places user tone before LUT input conversion', () => {
    const profile = getLUTColorProfile('sony-sgamut3cine-slog3')
    if (!profile) throw new Error('Missing profile')

    const graph = resolveExportColorGraph({
      styleKind: 'custom',
      intensity: 0.7,
      builtinPreset: null,
      userExposureEv: 1,
      userContrast: 50,
      lut: {
        size: 2,
        data: new Float32Array(24),
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        inputProfile: 'v-log',
        profileResolution: {
          kind: 'resolved',
          confidence: 'user',
          profile: {
            ...profile,
            outputGamut: 's-gamut3-cine',
            outputTransfer: 's-log3',
            outputRange: 'full',
          },
        },
      },
    })

    expect(graph.supported).toBe(true)
    if (!graph.supported) throw new Error('Expected supported graph')
    expect(graph.steps.map((step) => step.kind)).toEqual([
      'input-linear-prophoto',
      'raw-render-exposure',
      'user-exposure',
      'user-contrast',
      'gamut-to-lut-input',
      'encode-lut-transfer',
      'lut3d',
      'lut-output-to-srgb',
      'output-srgb',
    ])
    expect(graph.steps[2]).toMatchObject({
      kind: 'user-exposure',
      ev: 1,
      multiplier: 2,
    })
    expect(graph.steps[3]).toMatchObject({
      kind: 'user-contrast',
      amount: 50,
      factor: Math.pow(2, 50 / 200),
    })
  })

  it('keeps built-in style export failure pointed at built-in style support', () => {
    const graph = resolveExportColorGraph({
      styleKind: 'builtin',
      intensity: 0.7,
      builtinPreset: 'warm',
      userExposureEv: 1,
      userContrast: 50,
      lut: null,
    })

    expect(graph.supported).toBe(false)
    if (graph.supported) throw new Error('Expected unsupported graph')
    expect(graph.message).toBe(
      'Built-in styles are not supported by full-resolution JPEG export.',
    )
  })

  it('fails closed for built-in styles', () => {
    const graph = resolveExportColorGraph({
      styleKind: 'builtin',
      intensity: 0.7,
      builtinPreset: 'warm',
      lut: null,
    })

    expect(graph.supported).toBe(false)
    if (graph.supported) {
      throw new Error('Expected unsupported graph')
    }
    expect(graph.reason).toBe('unsupported-pipeline')
    expect(graph.message).toBe(
      'Built-in styles are not supported by full-resolution JPEG export.',
    )
    expect(graph.steps).toEqual([])
  })

  it('resolves scene creative LUTs with explicit input and output contracts', () => {
    const profile = getLUTColorProfile('sony-sgamut3cine-slog3')
    expect(profile).toBeDefined()

    const graph = resolveExportColorGraph({
      styleKind: 'custom',
      intensity: 0.7,
      builtinPreset: null,
      lut: {
        size: 2,
        data: new Float32Array(24),
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        inputProfile: 'v-log',
        profileResolution: {
          kind: 'resolved',
          confidence: 'user',
          profile: {
            ...profile!,
            outputGamut: 's-gamut3-cine',
            outputTransfer: 's-log3',
            outputRange: 'full',
          },
        },
      },
    })

    expect(graph.supported).toBe(true)
    if (!graph.supported) {
      throw new Error('Expected supported graph')
    }
    expect(graph.outputGamut).toBe('srgb-rec709')
    expect(graph.outputTransfer).toBe('srgb')
    expect(graph.steps.map((step) => step.kind)).toEqual([
      'input-linear-prophoto',
      'raw-render-exposure',
      'user-exposure',
      'user-contrast',
      'gamut-to-lut-input',
      'encode-lut-transfer',
      'lut3d',
      'lut-output-to-srgb',
      'output-srgb',
    ])
    expect(graph.steps[6]).toMatchObject({
      kind: 'lut3d',
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
    })
    expect(graph.steps[7]).toMatchObject({
      kind: 'lut-output-to-srgb',
      transfer: 's-log3',
      range: 'full',
      role: 'scene-creative',
      intensity: 0.7,
    })
  })

  it('routes V-Log input and BT.709 Rec.709 output as a combined output LUT', () => {
    const base = getLUTColorProfile('panasonic-vgamut-vlog')
    expect(base).toBeDefined()

    const graph = resolveExportColorGraph({
      styleKind: 'custom',
      intensity: 1,
      builtinPreset: null,
      lut: {
        size: 2,
        data: new Float32Array(24),
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        inputProfile: 'v-log',
        profileResolution: {
          kind: 'resolved',
          confidence: 'metadata',
          profile: {
            ...base!,
            role: 'combined-look-output',
            outputGamut: 'srgb-rec709',
            outputTransfer: 'bt709',
            outputRange: 'full',
          },
        },
      },
    })

    expect(graph.supported).toBe(true)
    if (!graph.supported) throw new Error('Expected supported graph')
    expect(graph.steps).toContainEqual(
      expect.objectContaining({
        kind: 'lut-output-to-srgb',
        transfer: 'bt709',
        range: 'full',
        role: 'combined-look-output',
      }),
    )
  })

  it('resolves omitted display-look output transfer from the LUT input transfer', () => {
    const profile = getLUTColorProfile('rec709-gamma24')
    expect(profile).toBeDefined()
    expect(profile?.role).toBe('display-look')
    expect(profile?.inputTransfer).toBe('gamma24')
    expect(profile?.outputTransfer).toBeUndefined()

    const graph = resolveExportColorGraph({
      styleKind: 'custom',
      intensity: 1,
      builtinPreset: null,
      lut: {
        size: 2,
        data: new Float32Array(24),
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        inputProfile: 'display-srgb',
        profileResolution: {
          kind: 'resolved',
          confidence: 'user',
          profile: profile!,
        },
      },
    })

    expect(graph.supported).toBe(true)
    if (!graph.supported) {
      throw new Error('Expected supported graph')
    }
    expect(graph.steps[7]).toMatchObject({
      kind: 'lut-output-to-srgb',
      transfer: 'gamma24',
      range: 'full',
      role: 'display-look',
      intensity: 1,
    })
  })

  it('fails closed for unresolved LUT profiles', () => {
    const graph = resolveExportColorGraph({
      styleKind: 'custom',
      intensity: 0.7,
      builtinPreset: null,
      lut: {
        size: 2,
        data: new Float32Array(24),
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        inputProfile: 'display-srgb',
        profileResolution: {
          kind: 'needs-user-selection',
          suggestions: [],
        },
      },
    })

    expect(graph.supported).toBe(false)
    if (graph.supported) {
      throw new Error('Expected unsupported graph')
    }
    expect(graph.reason).toBe('unsupported-pipeline')
    expect(graph.message).toBe(
      'Choose a LUT input profile before full-resolution export.',
    )
    expect(graph.steps).toEqual([])
  })

  it('fails closed when a non-display LUT has no declared output contract', () => {
    const profile = getLUTColorProfile('panasonic-vgamut-vlog')
    expect(profile).toBeDefined()

    const graph = resolveExportColorGraph({
      styleKind: 'custom',
      intensity: 1,
      builtinPreset: null,
      lut: {
        size: 2,
        data: new Float32Array(24),
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        inputProfile: 'v-log',
        profileResolution: {
          kind: 'resolved',
          confidence: 'user',
          profile: profile!,
        },
      },
    })

    expect(graph).toMatchObject({
      supported: false,
      reason: 'unsupported-pipeline',
      message: 'Choose a LUT output profile before full-resolution export.',
    })
  })

  it('fails closed for resolved technical output LUTs with explicit linear output transfer', () => {
    const profile = getLUTColorProfile('panasonic-vgamut-vlog')
    expect(profile).toBeDefined()

    const graph = resolveExportColorGraph({
      styleKind: 'custom',
      intensity: 0.7,
      builtinPreset: null,
      lut: {
        size: 2,
        data: new Float32Array(24),
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        inputProfile: 'v-log',
        profileResolution: {
          kind: 'resolved',
          confidence: 'metadata',
          profile: {
            ...profile!,
            role: 'technical-output',
            outputGamut: 'v-gamut',
            outputTransfer: 'linear',
            outputRange: 'full',
          },
        },
      },
    })

    expect(graph.supported).toBe(false)
    if (graph.supported) {
      throw new Error('Expected unsupported graph')
    }
    expect(graph.reason).toBe('unsupported-pipeline')
    expect(graph.message).toBe(
      'This LUT output transfer is not supported by full-resolution JPEG export.',
    )
  })

  it('fails closed for resolved technical output LUTs with unknown output range', () => {
    const profile = getLUTColorProfile('panasonic-vgamut-vlog')
    expect(profile).toBeDefined()

    const graph = resolveExportColorGraph({
      styleKind: 'custom',
      intensity: 0.7,
      builtinPreset: null,
      lut: {
        size: 2,
        data: new Float32Array(24),
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        inputProfile: 'v-log',
        profileResolution: {
          kind: 'resolved',
          confidence: 'metadata',
          profile: {
            ...profile!,
            role: 'technical-output',
            outputGamut: 'v-gamut',
            outputTransfer: 'v-log',
            outputRange: 'unknown',
          },
        },
      },
    })

    expect(graph.supported).toBe(false)
    if (graph.supported) {
      throw new Error('Expected unsupported graph')
    }
    expect(graph.reason).toBe('unsupported-pipeline')
    expect(graph.message).toBe(
      'This LUT output range must be explicit before full-resolution JPEG export.',
    )
  })

  it('fails closed for combined output LUTs with incomplete output contracts', () => {
    const profile = getLUTColorProfile('sony-sgamut3cine-slog3')
    expect(profile).toBeDefined()

    const graph = resolveExportColorGraph({
      styleKind: 'custom',
      intensity: 0.7,
      builtinPreset: null,
      lut: {
        size: 2,
        data: new Float32Array(24),
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        inputProfile: 'display-srgb',
        profileResolution: {
          kind: 'resolved',
          confidence: 'metadata',
          profile: {
            ...profile!,
            role: 'combined-look-output',
            outputGamut: undefined,
            outputTransfer: undefined,
          },
        },
      },
    })

    expect(graph.supported).toBe(false)
    if (graph.supported) {
      throw new Error('Expected unsupported graph')
    }
    expect(graph.reason).toBe('unsupported-pipeline')
    expect(graph.message).toBe(
      'Choose a LUT output profile before full-resolution export.',
    )
  })
})
