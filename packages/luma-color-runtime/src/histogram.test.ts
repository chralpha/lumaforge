import { describe, expect, it } from 'vitest'

import type { SupportedExportColorGraphDescriptor } from './color-graph'
import { createPreviewHistogramProcessor } from './histogram'

const noLutGraph: SupportedExportColorGraphDescriptor = {
  supported: true,
  outputGamut: 'srgb-rec709',
  outputTransfer: 'srgb',
  lutProfile: null,
  steps: [
    { kind: 'input-linear-prophoto' },
    { kind: 'raw-render-exposure', ev: 0, multiplier: 1 },
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
    { kind: 'output-srgb' },
  ],
}

function finishTwoPixelHistogram(source: Uint16Array) {
  const processor = createPreviewHistogramProcessor({
    width: 2,
    rowBandRows: 1,
    graph: noLutGraph,
  })
  processor.processUint16Rows(source, 1)
  return processor.finish({
    source: 'quick',
    width: 2,
    height: 1,
    totalRows: 1,
    ownership: 'main-thread-chunked-no-copy',
    inputByteLength: source.buffer.byteLength,
  })
}

describe('createPreviewHistogramProcessor', () => {
  it('accumulates RGB and luma bins from processed sRGB output', () => {
    const histogram = finishTwoPixelHistogram(
      new Uint16Array([0, 0, 0, 65535, 65535, 65535]),
    )

    expect(histogram.state).toBe('ready')
    expect(histogram.source).toBe('quick')
    expect(histogram.sampledPixels).toBe(2)
    expect(histogram.totalPixels).toBe(2)
    expect(histogram.bins.red[0]).toBe(1)
    expect(histogram.bins.green[0]).toBe(1)
    expect(histogram.bins.blue[0]).toBe(1)
    expect(histogram.bins.luma[0]).toBe(1)
    expect(histogram.bins.red[255]).toBe(1)
    expect(histogram.bins.green[255]).toBe(1)
    expect(histogram.bins.blue[255]).toBe(1)
    expect(histogram.bins.luma[255]).toBe(1)
    expect(histogram.clipping.shadowAnyChannel).toBe(1)
    expect(histogram.clipping.highlightAnyChannel).toBe(1)
  })

  it('applies raw render exposure and user exposure through the shared graph', () => {
    const graph: SupportedExportColorGraphDescriptor = {
      ...noLutGraph,
      steps: noLutGraph.steps.map((step) =>
        step.kind === 'user-exposure'
          ? { kind: 'user-exposure', ev: 1, multiplier: 2 }
          : step,
      ),
    }
    const processor = createPreviewHistogramProcessor({
      width: 1,
      rowBandRows: 1,
      graph,
    })

    processor.processUint16Rows(new Uint16Array([8192, 8192, 8192]), 1)
    const histogram = processor.finish({
      source: 'quick',
      width: 1,
      height: 1,
      totalRows: 1,
      ownership: 'main-thread-chunked-no-copy',
      inputByteLength: 6,
    })

    const nonZeroLumaBins = Array.from(histogram.bins.luma.entries()).filter(
      ([, count]) => count > 0,
    )
    expect(nonZeroLumaBins).toHaveLength(1)
    expect(nonZeroLumaBins[0]![0]).toBeGreaterThan(99)
  })

  it('never detaches or copies the source buffer in the default path', () => {
    const source = new Uint16Array([0, 0, 0, 65535, 65535, 65535])
    const beforeByteLength = source.buffer.byteLength
    const histogram = finishTwoPixelHistogram(source)

    expect(source.buffer.byteLength).toBe(beforeByteLength)
    expect(histogram.diagnostics.ownership).toBe('main-thread-chunked-no-copy')
    expect(histogram.diagnostics.copiedInputBytes).toBe(0)
    expect(histogram.diagnostics.transferredInput).toBe(false)
  })

  it('rejects invalid row slices before accumulation', () => {
    const processor = createPreviewHistogramProcessor({
      width: 2,
      rowBandRows: 1,
      graph: noLutGraph,
    })

    expect(() =>
      processor.processUint16Rows(new Uint16Array([0, 0, 0]), 1),
    ).toThrow('PREVIEW_HISTOGRAM_INVALID_SOURCE_LENGTH')
    expect(() => processor.processUint16Rows(new Uint16Array(12), 2)).toThrow(
      'PREVIEW_HISTOGRAM_INVALID_ROW_COUNT',
    )
  })
})
