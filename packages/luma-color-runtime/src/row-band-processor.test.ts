import type { SupportedExportColorGraphDescriptor } from './color-graph'
import { mat3Identity } from './matrix'
import type { LUTColorProfile } from './registry'
import { createRowBandProcessor } from './row-band-processor'

function neutralToneSteps(): SupportedExportColorGraphDescriptor['steps'] {
  return [
    { kind: 'user-exposure', ev: 0, multiplier: 1 },
    {
      kind: 'user-contrast',
      amount: 0,
      factor: 1,
      pivot: 0.18,
      operator: 'linear-prophoto-luminance-scale',
      luminanceCoefficients: [0.2880402, 0.7118741, 0.0000857],
      zeroLuminanceMode: 'return-black',
    },
    {
      kind: 'user-regional-tone',
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      operator: 'linear-prophoto-log-luminance-regions',
      luminanceCoefficients: [0.2880402, 0.7118741, 0.0000857],
      zeroLuminanceMode: 'return-black',
    },
  ]
}

const PRECISION_PROBE_LUT_PROFILE: LUTColorProfile = {
  id: 'test-linear-prophoto-probe',
  label: 'Test Linear ProPhoto Probe',
  role: 'scene-creative',
  inputGamut: 'prophoto-rgb',
  inputTransfer: 'linear',
  inputRange: 'full',
  outputGamut: 'srgb-rec709',
  outputTransfer: 'linear',
  outputRange: 'full',
  aliases: [],
}

const noLutGraph: SupportedExportColorGraphDescriptor = {
  supported: true,
  outputGamut: 'srgb-rec709',
  outputTransfer: 'srgb',
  lutProfile: null,
  steps: [
    { kind: 'input-linear-prophoto' },
    { kind: 'raw-render-exposure', ev: 0, multiplier: 1 },
    ...neutralToneSteps(),
    { kind: 'output-srgb' },
  ],
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function linearToSrgb(linear: number) {
  const clamped = Math.max(0, linear)
  return clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
}

function toSrgbByte(linear: number) {
  return Math.round(clamp01(linearToSrgb(linear)) * 255)
}

function makeRedRampLut() {
  const lut = new Float32Array(2 * 2 * 2 * 3)

  for (let blue = 0; blue < 2; blue += 1) {
    for (let green = 0; green < 2; green += 1) {
      for (let red = 0; red < 2; red += 1) {
        const index = ((blue * 2 + green) * 2 + red) * 3
        lut[index] = red
        lut[index + 1] = red
        lut[index + 2] = red
      }
    }
  }

  return lut
}

function makePrecisionProbeGraph(
  domainMin: number,
  domainMax: number,
): SupportedExportColorGraphDescriptor {
  return {
    supported: true,
    outputGamut: 'srgb-rec709',
    outputTransfer: 'srgb',
    lutProfile: PRECISION_PROBE_LUT_PROFILE,
    steps: [
      { kind: 'input-linear-prophoto' },
      { kind: 'raw-render-exposure', ev: 0, multiplier: 1 },
      ...neutralToneSteps(),
      {
        kind: 'gamut-to-lut-input',
        matrix: mat3Identity(),
        gamut: 'prophoto-rgb',
      },
      { kind: 'encode-lut-transfer', transfer: 'linear', range: 'full' },
      {
        kind: 'lut3d',
        size: 2,
        data: makeRedRampLut(),
        domainMin: [domainMin, 0, 0],
        domainMax: [domainMax, 1, 1],
      },
      {
        kind: 'lut-output-to-srgb',
        matrix: mat3Identity(),
        transfer: 'linear',
        range: 'full',
        role: 'scene-creative',
        intensity: 1,
      },
      { kind: 'output-srgb' },
    ],
  }
}

describe('createRowBandProcessor', () => {
  it('changes no-lut output when user exposure changes', () => {
    const graph: SupportedExportColorGraphDescriptor = {
      ...noLutGraph,
      steps: noLutGraph.steps.map((step) =>
        step.kind === 'user-exposure'
          ? { kind: 'user-exposure', ev: 1, multiplier: 2 }
          : step,
      ),
    }
    const processor = createRowBandProcessor({
      width: 1,
      rowBandRows: 1,
      graph,
    })
    const rows = processor.processFloatRows(
      new Float32Array([0.1, 0.1, 0.1]),
      1,
    )

    expect(rows[0]).toBeGreaterThan(toSrgbByte(0.1))
  })

  it('keeps neutral tone output equal to the pre-tone no-lut reference', () => {
    const processor = createRowBandProcessor({
      width: 1,
      rowBandRows: 1,
      graph: noLutGraph,
    })
    const rows = processor.processFloatRows(
      new Float32Array([0.18, 0.18, 0.18]),
      1,
    )

    expect(rows).toEqual(
      new Uint8Array([toSrgbByte(0.18), toSrgbByte(0.18), toSrgbByte(0.18)]),
    )
  })

  it('applies user contrast before LUT input sampling', () => {
    const domainMin = 0.4
    const domainMax = 0.8
    const sourceLinear = 0.36
    const graph = makePrecisionProbeGraph(domainMin, domainMax)
    const contrastStep = graph.steps.find(
      (step) => step.kind === 'user-contrast',
    )
    if (!contrastStep || contrastStep.kind !== 'user-contrast') {
      throw new Error('Missing contrast step')
    }
    contrastStep.amount = 100
    contrastStep.factor = Math.SQRT2

    const processor = createRowBandProcessor({
      width: 1,
      rowBandRows: 1,
      graph,
    })
    const rows = processor.processFloatRows(
      new Float32Array([sourceLinear, sourceLinear, sourceLinear]),
      1,
    )
    const tonedLinear =
      contrastStep.pivot *
      Math.pow(sourceLinear / contrastStep.pivot, contrastStep.factor)
    const normalizedTonedInput = clamp01(
      (tonedLinear - domainMin) / (domainMax - domainMin),
    )
    const normalizedUntonedInput = clamp01(
      (sourceLinear - domainMin) / (domainMax - domainMin),
    )

    expect(normalizedUntonedInput).toBe(0)
    expect(rows).toEqual(
      new Uint8Array([
        toSrgbByte(normalizedTonedInput),
        toSrgbByte(normalizedTonedInput),
        toSrgbByte(normalizedTonedInput),
      ]),
    )
    expect(rows[0]).not.toBe(0)
  })

  it('applies regional tone before LUT input sampling', () => {
    const domainMin = 0.6
    const domainMax = 1.1
    const sourceLinear = 0.72
    const graph = makePrecisionProbeGraph(domainMin, domainMax)
    const regionalStep = graph.steps.find(
      (step) => step.kind === 'user-regional-tone',
    )
    if (!regionalStep || regionalStep.kind !== 'user-regional-tone') {
      throw new Error('Missing regional tone step')
    }
    regionalStep.highlights = 100
    regionalStep.whites = 50

    const processor = createRowBandProcessor({
      width: 1,
      rowBandRows: 1,
      graph,
    })
    const rows = processor.processFloatRows(
      new Float32Array([sourceLinear, sourceLinear, sourceLinear]),
      1,
    )
    const normalizedUntonedInput = clamp01(
      (sourceLinear - domainMin) / (domainMax - domainMin),
    )

    expect(rows[0]).toBeGreaterThan(toSrgbByte(normalizedUntonedInput))
  })

  it('keeps Uint16 rows in Float32 until LUT sampling and final RGB8 quantization', () => {
    const sourceValue = 32768
    const sourceLinear = Math.fround(sourceValue / 65535)
    const domainMin = 0.5
    const domainMax = 0.50002
    const processor = createRowBandProcessor({
      width: 1,
      rowBandRows: 1,
      graph: makePrecisionProbeGraph(domainMin, domainMax),
    })
    const rows = processor.processUint16Rows(
      new Uint16Array([sourceValue, 0, 0]),
      1,
    )
    const normalizedLutInput = clamp01(
      (sourceLinear - domainMin) / (domainMax - domainMin),
    )
    const byteQuantizedLinear = Math.round(sourceLinear * 255) / 255
    const byteQuantizedLutInput = clamp01(
      (byteQuantizedLinear - domainMin) / (domainMax - domainMin),
    )

    expect(rows).toEqual(
      new Uint8Array([
        toSrgbByte(normalizedLutInput),
        toSrgbByte(normalizedLutInput),
        toSrgbByte(normalizedLutInput),
      ]),
    )
    expect(rows[0]).not.toBe(toSrgbByte(byteQuantizedLutInput))
  })

  it('reuses the RGB8 scratch buffer and returns only the requested row slice', () => {
    const processor = createRowBandProcessor({
      width: 2,
      rowBandRows: 3,
      graph: noLutGraph,
    })
    const first = processor.processFloatRows(
      new Float32Array(2 * 3 * 3).fill(0.25),
      3,
    )
    const second = processor.processFloatRows(
      new Float32Array(2 * 2 * 3).fill(0.5),
      2,
    )
    const third = processor.processUint16Rows(
      new Uint16Array(2 * 1 * 3).fill(32768),
      1,
    )

    expect(processor.rowBandRows).toBe(3)
    expect(processor.reusesOutputBuffer).toBe(true)
    expect(first).toHaveLength(18)
    expect(second).toHaveLength(12)
    expect(third).toHaveLength(6)
    expect(second.byteOffset).toBe(0)
    expect(third.byteOffset).toBe(0)
    expect(second.buffer).toBe(first.buffer)
    expect(third.buffer).toBe(first.buffer)
  })

  it.each([0, -1, 1.5, Number.NaN, Infinity])(
    'rejects invalid width %s',
    (width) => {
      expect(() =>
        createRowBandProcessor({
          width,
          rowBandRows: 1,
          graph: noLutGraph,
        }),
      ).toThrow('ROW_BAND_PROCESSOR_INVALID_WIDTH')
    },
  )

  it.each([0, -1, 1.5, Number.NaN, Infinity])(
    'rejects invalid row band size %s',
    (rowBandRows) => {
      expect(() =>
        createRowBandProcessor({
          width: 1,
          rowBandRows,
          graph: noLutGraph,
        }),
      ).toThrow('ROW_BAND_PROCESSOR_INVALID_ROW_BAND_ROWS')
    },
  )

  it.each([0, -1, 1.5, Number.NaN, Infinity, 3])(
    'rejects invalid row count %s',
    (rowCount) => {
      const processor = createRowBandProcessor({
        width: 1,
        rowBandRows: 2,
        graph: noLutGraph,
      })

      expect(() =>
        processor.processFloatRows(new Float32Array(3), rowCount),
      ).toThrow('ROW_BAND_PROCESSOR_INVALID_ROW_COUNT')
      expect(() =>
        processor.processUint16Rows(new Uint16Array(3), rowCount),
      ).toThrow('ROW_BAND_PROCESSOR_INVALID_ROW_COUNT')
    },
  )

  it('rejects source lengths that do not match width and row count', () => {
    const processor = createRowBandProcessor({
      width: 2,
      rowBandRows: 2,
      graph: noLutGraph,
    })

    expect(() =>
      processor.processFloatRows(new Float32Array(2 * 1 * 3 - 1), 1),
    ).toThrow('ROW_BAND_PROCESSOR_INVALID_SOURCE_LENGTH')
    expect(() =>
      processor.processFloatRows(new Float32Array(2 * 1 * 3 + 1), 1),
    ).toThrow('ROW_BAND_PROCESSOR_INVALID_SOURCE_LENGTH')
    expect(() =>
      processor.processUint16Rows(new Uint16Array(2 * 2 * 3), 1),
    ).toThrow('ROW_BAND_PROCESSOR_INVALID_SOURCE_LENGTH')

    expect(
      processor.processUint16Rows(new Uint16Array(2 * 1 * 3), 1),
    ).toHaveLength(6)
  })

  it('does not depend on method receiver binding', () => {
    const processor = createRowBandProcessor({
      width: 1,
      rowBandRows: 1,
      graph: noLutGraph,
    })
    const { processUint16Rows } = processor

    expect(
      processUint16Rows(new Uint16Array([4000, 5000, 6000]), 1),
    ).toHaveLength(3)
  })
})
