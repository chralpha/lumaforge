/**
 * TIFF encoder for 16-bit image export.
 * Implements basic TIFF format without compression for simplicity.
 */

/**
 * Encode pixel data to TIFF format.
 * @param pixels - RGBA float data (0-1 range)
 * @param width - Image width
 * @param height - Image height
 * @returns TIFF file as ArrayBuffer
 */
export function encodeTIFF(
  pixels: Float32Array,
  width: number,
  height: number,
): ArrayBuffer {
  // Calculate sizes
  const samplesPerPixel = 3 // RGB
  const bytesPerSample = 2
  const rowBytes = width * samplesPerPixel * bytesPerSample
  const imageDataSize = height * rowBytes

  // IFD entry count
  const ifdEntryCount = 11

  // Calculate offsets
  const headerSize = 8 // TIFF header
  const ifdSize = 2 + ifdEntryCount * 12 + 4 // count + entries + next IFD pointer
  const bitsPerSampleOffset = headerSize + ifdSize
  const stripOffsetsOffset = bitsPerSampleOffset + 6 // 3 x 16-bit values
  const imageDataOffset = stripOffsetsOffset + 4 // 1 x 32-bit value

  const totalSize = imageDataOffset + imageDataSize
  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)

  let offset = 0

  // TIFF Header (8 bytes)
  // Byte order: II (little-endian)
  view.setUint8(offset++, 0x49) // 'I'
  view.setUint8(offset++, 0x49) // 'I'
  // Magic number: 42
  view.setUint16(offset, 42, true)
  offset += 2
  // IFD offset
  view.setUint32(offset, headerSize, true)
  offset += 4

  // IFD (Image File Directory)
  // Number of directory entries
  view.setUint16(offset, ifdEntryCount, true)
  offset += 2

  // Helper to write IFD entry
  const writeIFDEntry = (
    tag: number,
    type: number,
    count: number,
    value: number,
  ) => {
    view.setUint16(offset, tag, true)
    offset += 2
    view.setUint16(offset, type, true)
    offset += 2
    view.setUint32(offset, count, true)
    offset += 4
    view.setUint32(offset, value, true)
    offset += 4
  }

  // TIFF tag types
  const SHORT = 3 // 16-bit unsigned
  const LONG = 4 // 32-bit unsigned

  // IFD Entries (must be sorted by tag in ascending order)
  // 256: ImageWidth
  writeIFDEntry(256, LONG, 1, width)
  // 257: ImageLength (height)
  writeIFDEntry(257, LONG, 1, height)
  // 258: BitsPerSample (offset to 3 values)
  writeIFDEntry(258, SHORT, 3, bitsPerSampleOffset)
  // 259: Compression (1 = no compression)
  writeIFDEntry(259, SHORT, 1, 1)
  // 262: PhotometricInterpretation (2 = RGB)
  writeIFDEntry(262, SHORT, 1, 2)
  // 273: StripOffsets
  writeIFDEntry(273, LONG, 1, imageDataOffset)
  // 277: SamplesPerPixel
  writeIFDEntry(277, SHORT, 1, samplesPerPixel)
  // 278: RowsPerStrip
  writeIFDEntry(278, LONG, 1, height)
  // 279: StripByteCounts
  writeIFDEntry(279, LONG, 1, imageDataSize)
  // 284: PlanarConfiguration (1 = chunky)
  writeIFDEntry(284, SHORT, 1, 1)
  // 339: SampleFormat (1 = unsigned integer)
  writeIFDEntry(339, SHORT, 1, 1)

  // Next IFD offset (0 = no more IFDs)
  view.setUint32(offset, 0, true)
  offset += 4

  // BitsPerSample values (3 x 16-bit)
  view.setUint16(offset, 16, true)
  offset += 2
  view.setUint16(offset, 16, true)
  offset += 2
  view.setUint16(offset, 16, true)
  offset += 2

  // Skip to image data offset
  offset = imageDataOffset

  // Write image data (convert float32 RGBA to uint16 RGB)
  const pixelCount = width * height
  for (let i = 0; i < pixelCount; i++) {
    const srcIdx = i * 4
    // Flip Y coordinate (TIFF is top-to-bottom)
    const row = Math.floor(i / width)
    const col = i % width
    const flippedRow = height - 1 - row
    const dstOffset = imageDataOffset + (flippedRow * width + col) * 6

    // Clamp and convert to 16-bit
    const r = Math.max(0, Math.min(1, pixels[srcIdx + 0]))
    const g = Math.max(0, Math.min(1, pixels[srcIdx + 1]))
    const b = Math.max(0, Math.min(1, pixels[srcIdx + 2]))

    view.setUint16(dstOffset + 0, Math.round(r * 65535), true)
    view.setUint16(dstOffset + 2, Math.round(g * 65535), true)
    view.setUint16(dstOffset + 4, Math.round(b * 65535), true)
  }

  return buffer
}

/**
 * Download a buffer as a file.
 */
export function downloadFile(
  buffer: ArrayBuffer,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([buffer], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Export image as TIFF.
 */
export function exportTIFF(
  pixels: Float32Array,
  width: number,
  height: number,
  filename: string,
): void {
  const tiff = encodeTIFF(pixels, width, height)
  downloadFile(tiff, filename, 'image/tiff')
}

/**
 * Export canvas as JPEG.
 */
export function exportJPEG(
  canvas: HTMLCanvasElement,
  filename: string,
  quality = 0.95,
): void {
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        console.error('Failed to create JPEG blob')
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.append(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
    'image/jpeg',
    quality,
  )
}

/**
 * Export canvas as PNG.
 */
export function exportPNG(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) {
      console.error('Failed to create PNG blob')
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.append(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

export type ExportFormat = 'tiff' | 'jpeg' | 'png'

export interface ExportOptions {
  format: ExportFormat
  filename: string
  quality?: number // For JPEG
}
