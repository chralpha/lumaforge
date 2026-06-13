import type { SupportedExportColorGraphDescriptor } from '@lumaforge/luma-color-runtime'
import { createRowBandProcessor } from '@lumaforge/luma-color-runtime'

const PREVIEW_ROW_BAND_ROWS = 32

export type RenderCpuPreviewFrameInput = {
  data: Uint16Array
  width: number
  height: number
  graph: SupportedExportColorGraphDescriptor
}

export function renderCpuPreviewFrame({
  data,
  width,
  height,
  graph,
}: RenderCpuPreviewFrameInput): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4)
  const proc = createRowBandProcessor({
    width,
    rowBandRows: Math.min(PREVIEW_ROW_BAND_ROWS, height),
    graph,
  })

  for (let row = 0; row < height; row += proc.rowBandRows) {
    const rowCount = Math.min(proc.rowBandRows, height - row)
    const srcOffset = row * width * 3
    const band = data.subarray(srcOffset, srcOffset + rowCount * width * 3)
    const rgb = proc.processUint16Rows(band, rowCount)
    const pixelCount = rowCount * width
    const dstPixelOffset = row * width
    for (let p = 0; p < pixelCount; p += 1) {
      const d = (dstPixelOffset + p) * 4
      const s = p * 3
      rgba[d + 0] = rgb[s + 0]
      rgba[d + 1] = rgb[s + 1]
      rgba[d + 2] = rgb[s + 2]
      rgba[d + 3] = 255
    }
  }

  return rgba
}
