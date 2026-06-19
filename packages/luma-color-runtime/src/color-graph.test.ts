import { describe, expect, it } from 'vitest'

import type { ExportColorGraphStep } from './color-graph'
import { resolveExportColorGraph } from './color-graph'
import { getLUTColorProfile } from './registry'
import {
  CHROMA_CLAMP_HIGH,
  CHROMA_CLAMP_LOW,
  LUT_CONSTANTS_VERSION,
  LUT_SIZE,
  resolveSelectiveColorParams,
} from './selective-color'

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
      'user-color-balance',
      'user-exposure',
      'user-contrast',
      'user-regional-tone',
      'user-saturation',
      'user-selective-color',
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
        {
          kind: 'user-color-balance',
          temperature: 0,
          tint: 0,
          gain: [1, 1, 1],
        },
        { kind: 'user-exposure', ev: 0, multiplier: 1 },
        { kind: 'user-contrast', amount: 0, factor: 1 },
        {
          kind: 'user-regional-tone',
          highlights: 0,
          shadows: 0,
          whites: 0,
          blacks: 0,
        },
        { kind: 'user-saturation' },
        { kind: 'user-selective-color' },
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
      'user-color-balance',
      'user-exposure',
      'user-contrast',
      'user-regional-tone',
      'user-saturation',
      'user-selective-color',
      'output-srgb',
    ])
    expect(graph.steps[2]).toMatchObject({
      kind: 'user-color-balance',
      temperature: 0,
      tint: 0,
      gain: [1, 1, 1],
      operator: 'linear-prophoto-relative-rgb-gain',
      luminanceCoefficients: [0.2880402, 0.7118741, 0.0000857],
    })
    expect(graph.steps[3]).toMatchObject({
      kind: 'user-exposure',
      ev: 0,
      multiplier: 1,
    })
    expect(graph.steps[4]).toMatchObject({
      kind: 'user-contrast',
      amount: 0,
      factor: 1,
      pivot: 0.18,
      operator: 'linear-prophoto-luminance-scale',
      luminanceCoefficients: [0.2880402, 0.7118741, 0.0000857],
      zeroLuminanceMode: 'return-black',
    })
    expect(graph.steps[5]).toMatchObject({
      kind: 'user-regional-tone',
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      operator: 'linear-prophoto-log-luminance-regions',
      luminanceCoefficients: [0.2880402, 0.7118741, 0.0000857],
      zeroLuminanceMode: 'return-black',
    })
  })

  it('places user color balance after raw render exposure and before tone', () => {
    const graph = resolveExportColorGraph({
      styleKind: 'none',
      intensity: 0.7,
      builtinPreset: null,
      lut: null,
      userTemperature: 40,
      userTint: -25,
    })

    expect(graph.supported).toBe(true)
    if (!graph.supported) throw new Error('Expected supported graph')
    expect(graph.steps.map((step) => step.kind).slice(0, 5)).toEqual([
      'input-linear-prophoto',
      'raw-render-exposure',
      'user-color-balance',
      'user-exposure',
      'user-contrast',
    ])
    expect(graph.steps[2]).toMatchObject({
      kind: 'user-color-balance',
      temperature: 40,
      tint: -25,
    })
  })

  it('places user tone and regional tone before LUT input conversion', () => {
    const profile = getLUTColorProfile('sony-sgamut3cine-slog3')
    if (!profile) throw new Error('Missing profile')

    const graph = resolveExportColorGraph({
      styleKind: 'custom',
      intensity: 0.7,
      builtinPreset: null,
      userExposureEv: 1,
      userContrast: 50,
      userHighlights: -40,
      userShadows: 35,
      userWhites: -25,
      userBlacks: 20,
      lut: {
        size: 2,
        data: new Float32Array(24),
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        inputProfile: 'v-log',
        profileResolution: {
          kind: 'confirmed',
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
      'user-color-balance',
      'user-exposure',
      'user-contrast',
      'user-regional-tone',
      'user-saturation',
      'user-selective-color',
      'gamut-to-lut-input',
      'encode-lut-transfer',
      'lut3d',
      'lut-output-to-srgb',
      'output-srgb',
    ])
    expect(graph.steps[3]).toMatchObject({
      kind: 'user-exposure',
      ev: 1,
      multiplier: 2,
    })
    expect(graph.steps[4]).toMatchObject({
      kind: 'user-contrast',
      amount: 50,
      factor: Math.pow(2, 50 / 200),
    })
    expect(graph.steps[5]).toMatchObject({
      kind: 'user-regional-tone',
      highlights: -40,
      shadows: 35,
      whites: -25,
      blacks: 20,
    })
  })

  it('keeps built-in style export failure pointed at built-in style support', () => {
    const graph = resolveExportColorGraph({
      styleKind: 'builtin',
      intensity: 0.7,
      builtinPreset: 'warm',
      userExposureEv: 1,
      userContrast: 50,
      userHighlights: -40,
      userShadows: 40,
      userWhites: -20,
      userBlacks: 20,
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
          kind: 'confirmed',
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
      'user-color-balance',
      'user-exposure',
      'user-contrast',
      'user-regional-tone',
      'user-saturation',
      'user-selective-color',
      'gamut-to-lut-input',
      'encode-lut-transfer',
      'lut3d',
      'lut-output-to-srgb',
      'output-srgb',
    ])
    expect(graph.steps[10]).toMatchObject({
      kind: 'lut3d',
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
    })
    expect(graph.steps[11]).toMatchObject({
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
          kind: 'confirmed',
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
          kind: 'confirmed',
          confidence: 'user',
          profile: profile!,
        },
      },
    })

    expect(graph.supported).toBe(true)
    if (!graph.supported) {
      throw new Error('Expected supported graph')
    }
    expect(graph.steps[11]).toMatchObject({
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
          kind: 'unknown',
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
          kind: 'confirmed',
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
          kind: 'confirmed',
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
          kind: 'confirmed',
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
          kind: 'confirmed',
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

  it('emits user-saturation step at index 6 in simple graph', () => {
    const graph = resolveExportColorGraph({
      styleKind: 'none',
      intensity: 0.7,
      builtinPreset: null,
      lut: null,
      userSaturation: 42,
      userVibrance: -17,
    })
    expect(graph.supported).toBe(true)
    if (!graph.supported) return
    expect(graph.steps).toHaveLength(9)
    expect(graph.steps[6].kind).toBe('user-saturation')
    const step = graph.steps[6] as any
    expect(step.saturation).toBe(42)
    expect(step.vibrance).toBe(-17)
    expect(step.operator).toBe('oklab-chroma-with-skin-protection')
    expect(graph.steps[7].kind).toBe('user-selective-color')
    expect(graph.steps[8].kind).toBe('output-srgb')
  })

  it('always emits user-saturation even when both are zero', () => {
    const graph = resolveExportColorGraph({
      styleKind: 'none',
      intensity: 0.7,
      builtinPreset: null,
      lut: null,
      userSaturation: 0,
      userVibrance: 0,
    })
    expect(graph.supported).toBe(true)
    if (!graph.supported) return
    expect(graph.steps[6].kind).toBe('user-saturation')
  })

  describe('user-selective-color graph step', () => {
    it('graph_step_composition: inserts selective-color after regional tone and before LUT/output', () => {
      const noLutGraph = resolveExportColorGraph({
        styleKind: 'none',
        intensity: 0.7,
        builtinPreset: null,
        lut: null,
      })

      expect(noLutGraph.supported).toBe(true)
      if (!noLutGraph.supported) throw new Error('Expected supported graph')
      const noLutKinds = noLutGraph.steps.map((step) => step.kind)
      const regionalToneIdx = noLutKinds.indexOf('user-regional-tone')
      const selectiveColorIdx = noLutKinds.indexOf('user-selective-color')
      const outputSrgbIdx = noLutKinds.indexOf('output-srgb')
      expect(selectiveColorIdx).toBeGreaterThan(regionalToneIdx)
      expect(selectiveColorIdx).toBeLessThan(outputSrgbIdx)

      const profile = getLUTColorProfile('sony-sgamut3cine-slog3')
      if (!profile) throw new Error('Missing profile')

      const customLutGraph = resolveExportColorGraph({
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
            kind: 'confirmed',
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

      expect(customLutGraph.supported).toBe(true)
      if (!customLutGraph.supported) {
        throw new Error('Expected supported graph')
      }
      const customLutKinds = customLutGraph.steps.map((step) => step.kind)
      const regionalToneCustomIdx = customLutKinds.indexOf('user-regional-tone')
      const selectiveColorCustomIdx = customLutKinds.indexOf(
        'user-selective-color',
      )
      const gamutToLutIdx = customLutKinds.indexOf('gamut-to-lut-input')
      expect(selectiveColorCustomIdx).toBeGreaterThan(regionalToneCustomIdx)
      expect(selectiveColorCustomIdx).toBeLessThan(gamutToLutIdx)
    })

    it('graph_step_no_buffer: graph step carries durable params only, never a Float32Array', () => {
      const graph = resolveExportColorGraph({
        styleKind: 'none',
        intensity: 0.7,
        builtinPreset: null,
        lut: null,
        selectiveColor: {
          red: { hue: 50, saturation: 0, lightness: 0 },
          orange: { hue: 0, saturation: 0, lightness: 0 },
          yellow: { hue: 0, saturation: 0, lightness: 0 },
          green: { hue: 0, saturation: 0, lightness: 0 },
          aqua: { hue: 0, saturation: 0, lightness: 0 },
          blue: { hue: 0, saturation: 0, lightness: 0 },
          purple: { hue: 0, saturation: 0, lightness: 0 },
          magenta: { hue: 0, saturation: 0, lightness: 0 },
        },
      })

      expect(graph.supported).toBe(true)
      if (!graph.supported) throw new Error('Expected supported graph')
      const step = graph.steps.find((s) => s.kind === 'user-selective-color')
      expect(step).toBeDefined()
      if (!step) throw new Error('Expected selective-color step')

      // Walk every property; no value may be a Float32Array (or any TypedArray
      // smelling like a LUT buffer). The step is durable params + constants.
      for (const value of Object.values(step)) {
        expect(value instanceof Float32Array).toBe(false)
        expect(value instanceof Uint8Array).toBe(false)
        if (
          value !== null &&
          typeof value === 'object' &&
          'length' in (value as object)
        ) {
          expect((value as ArrayLike<unknown>).length).not.toBe(1024)
        }
      }

      // TypeScript-level regression catch: the step type must not declare a
      // Float32Array `buffer` property. The @ts-expect-error fails to compile
      // if a future change adds one.
      type StepKind = Extract<
        ExportColorGraphStep,
        { kind: 'user-selective-color' }
      >
      const _typeCheck = (s: StepKind): unknown =>
        // @ts-expect-error: step must not carry a Float32Array buffer
        s.buffer satisfies Float32Array
      void _typeCheck
    })

    it('lut_ownership: graph step is decoupled from any baked LUT buffer', () => {
      const input = {
        styleKind: 'none' as const,
        intensity: 0.7,
        builtinPreset: null,
        lut: null,
        selectiveColor: {
          red: { hue: 50, saturation: 0, lightness: 0 },
          orange: { hue: 0, saturation: 0, lightness: 0 },
          yellow: { hue: 0, saturation: 0, lightness: 0 },
          green: { hue: 0, saturation: 0, lightness: 0 },
          aqua: { hue: 0, saturation: 0, lightness: 0 },
          blue: { hue: 0, saturation: 0, lightness: 0 },
          purple: { hue: 0, saturation: 0, lightness: 0 },
          magenta: { hue: 0, saturation: 0, lightness: 0 },
        },
      }

      const graph = resolveExportColorGraph(input)
      expect(graph.supported).toBe(true)
      if (!graph.supported) throw new Error('Expected supported graph')
      const graphStep = graph.steps.find(
        (s) => s.kind === 'user-selective-color',
      )
      expect(graphStep).toBeDefined()
      if (!graphStep) throw new Error('Expected selective-color step')

      // Pool buffer simulates caller-owned T4 ownership model.
      const poolBuffer = new Float32Array(4 * LUT_SIZE)
      const { step: bakeStep, prepared } = resolveSelectiveColorParams(
        { selectiveColor: input.selectiveColor },
        poolBuffer,
      )
      expect(prepared.buffer).toBe(poolBuffer)

      // Snapshot before mutation.
      const before = JSON.stringify(graphStep)
      // Mutate the caller-owned pool buffer in place.
      poolBuffer.fill(999)
      // Captured graph step is untouched (no buffer reference).
      const after = JSON.stringify(graphStep)
      expect(after).toBe(before)

      // Structural equality of bands between graph step and bake step.
      expect(graphStep).toMatchObject({
        kind: 'user-selective-color',
        chromaClampLow: CHROMA_CLAMP_LOW,
        chromaClampHigh: CHROMA_CLAMP_HIGH,
        workingSpace: 'oklab-via-prophoto-d65',
        operator: 'oklch-per-band-shift',
        constantsVersion: LUT_CONSTANTS_VERSION,
      })
      if (graphStep.kind !== 'user-selective-color') {
        throw new Error('Type narrow guard')
      }
      expect(graphStep.bands).toEqual(bakeStep.bands)
    })
  })
})
