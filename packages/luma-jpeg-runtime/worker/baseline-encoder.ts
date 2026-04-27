import type { InternalJpegEncoder } from './runtime-core'

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40,
  48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29,
  22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54,
  47, 55, 62, 63,
]

const LUMA_Q = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16,
  24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109,
  103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
]

const CHROMA_Q = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56,
  99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99,
]

const LUMA_DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]
const CHROMA_DC_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]
const LUMA_DC_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const CHROMA_DC_VALUES = LUMA_DC_VALUES

const LUMA_AC_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7D]
const CHROMA_AC_BITS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77]
const LUMA_AC_VALUES = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13,
  0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08, 0x23, 0x42,
  0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0A,
  0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x34, 0x35,
  0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4A,
  0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0x63, 0x64, 0x65, 0x66, 0x67,
  0x68, 0x69, 0x6A, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84,
  0x85, 0x86, 0x87, 0x88, 0x89, 0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
  0x99, 0x9A, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3,
  0xB4, 0xB5, 0xB6, 0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7,
  0xC8, 0xC9, 0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1,
  0xE2, 0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
  0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA,
]
const CHROMA_AC_VALUES = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51,
  0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xA1, 0xB1,
  0xC1, 0x09, 0x23, 0x33, 0x52, 0xF0, 0x15, 0x62, 0x72, 0xD1, 0x0A, 0x16, 0x24,
  0x34, 0xE1, 0x25, 0xF1, 0x17, 0x18, 0x19, 0x1A, 0x26, 0x27, 0x28, 0x29, 0x2A,
  0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0x63, 0x64, 0x65, 0x66,
  0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7A, 0x82,
  0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8A, 0x92, 0x93, 0x94, 0x95, 0x96,
  0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA,
  0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5,
  0xC6, 0xC7, 0xC8, 0xC9, 0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9,
  0xDA, 0xE2, 0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF2, 0xF3, 0xF4,
  0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA,
]

const COSINES = Array.from({ length: 8 }, (_, x) =>
  Array.from({ length: 8 }, (_, u) =>
    Math.cos(((2 * x + 1) * u * Math.PI) / 16),
  ),
)
const DCT_SCALE = Array.from({ length: 8 }, (_, i) =>
  i === 0 ? 1 / Math.SQRT2 : 1,
)

type HuffmanCode = { code: number; length: number }
type HuffmanTable = Map<number, HuffmanCode>

function clampByte(value: number) {
  return Math.min(255, Math.max(0, value))
}

function scaledQuantTable(base: number[], quality: number) {
  const qualityLevel = Math.min(100, Math.max(1, Math.round(quality * 100)))
  const scale = qualityLevel < 50 ? 5000 / qualityLevel : 200 - qualityLevel * 2

  return base.map((value) =>
    Math.min(255, Math.max(1, Math.floor((value * scale + 50) / 100))),
  )
}

function buildHuffmanTable(bits: number[], values: number[]): HuffmanTable {
  const table = new Map<number, HuffmanCode>()
  let code = 0
  let valueIndex = 0

  for (let bitIndex = 0; bitIndex < bits.length; bitIndex += 1) {
    const length = bitIndex + 1
    for (let i = 0; i < bits[bitIndex]; i += 1) {
      table.set(values[valueIndex], { code, length })
      code += 1
      valueIndex += 1
    }
    code <<= 1
  }

  return table
}

function category(value: number) {
  let absolute = Math.abs(value)
  let length = 0

  while (absolute > 0) {
    length += 1
    absolute >>= 1
  }

  return length
}

function amplitudeBits(value: number, bitLength: number) {
  if (value >= 0) {
    return value
  }
  return value - 1 + (1 << bitLength)
}

function createNumberArray(length: number, value: number) {
  const values: number[] = []
  for (let i = 0; i < length; i += 1) {
    values.push(value)
  }
  return values
}

class JpegByteWriter {
  private readonly chunks: BlobPart[] = []
  private buffer: number[] = []
  private bitBuffer = 0
  private bitCount = 0

  writeByte(value: number) {
    this.buffer.push(value & 0xFF)
    if (this.buffer.length >= 16384) {
      this.flushBuffer()
    }
  }

  writeWord(value: number) {
    this.writeByte(value >> 8)
    this.writeByte(value)
  }

  writeMarker(marker: number) {
    this.writeByte(0xFF)
    this.writeByte(marker)
  }

  writeString(value: string) {
    for (let i = 0; i < value.length; i += 1) {
      this.writeByte(value.charCodeAt(i))
    }
  }

  writeBits(bits: number, length: number) {
    if (length === 0) {
      return
    }

    this.bitBuffer = (this.bitBuffer << length) | bits
    this.bitCount += length

    while (this.bitCount >= 8) {
      const byte = (this.bitBuffer >> (this.bitCount - 8)) & 0xFF
      this.writeByte(byte)
      if (byte === 0xFF) {
        this.writeByte(0)
      }
      this.bitCount -= 8
    }
  }

  flushBits() {
    if (this.bitCount === 0) {
      return
    }

    const padding = 8 - this.bitCount
    const byte = ((this.bitBuffer << padding) | ((1 << padding) - 1)) & 0xFF
    this.writeByte(byte)
    if (byte === 0xFF) {
      this.writeByte(0)
    }
    this.bitBuffer = 0
    this.bitCount = 0
  }

  toBlob() {
    this.flushBuffer()
    return new Blob(this.chunks, { type: 'image/jpeg' })
  }

  clear() {
    this.chunks.length = 0
    this.buffer = []
    this.bitBuffer = 0
    this.bitCount = 0
  }

  private flushBuffer() {
    if (this.buffer.length === 0) {
      return
    }

    this.chunks.push(new Uint8Array(this.buffer))
    this.buffer = []
  }
}

class BaselineSequentialJpegEncoder implements InternalJpegEncoder {
  private readonly writer = new JpegByteWriter()
  private readonly rowBand: Uint8Array
  private readonly lumaQuant: number[]
  private readonly chromaQuant: number[]
  private readonly lumaDc = buildHuffmanTable(LUMA_DC_BITS, LUMA_DC_VALUES)
  private readonly chromaDc = buildHuffmanTable(
    CHROMA_DC_BITS,
    CHROMA_DC_VALUES,
  )
  private readonly lumaAc = buildHuffmanTable(LUMA_AC_BITS, LUMA_AC_VALUES)
  private readonly chromaAc = buildHuffmanTable(
    CHROMA_AC_BITS,
    CHROMA_AC_VALUES,
  )
  private readonly block = createNumberArray(64, 0)
  private readonly coefficients = createNumberArray(64, 0)
  private bandRows = 0
  private previousDc = [0, 0, 0]
  private finished = false
  private aborted = false

  constructor(
    private readonly width: number,
    private readonly height: number,
    quality: number,
  ) {
    this.rowBand = new Uint8Array(width * 8 * 3)
    this.lumaQuant = scaledQuantTable(LUMA_Q, quality)
    this.chromaQuant = scaledQuantTable(CHROMA_Q, quality)
    this.writeHeaders()
  }

  async writeRows(rows: Uint8Array, rowCount: number) {
    if (this.finished) {
      throw new Error('JPEG_RUNTIME_FINISHED')
    }
    if (this.aborted) {
      throw new Error('JPEG_RUNTIME_ABORTED')
    }

    let sourceRow = 0
    while (sourceRow < rowCount) {
      const rowsToCopy = Math.min(8 - this.bandRows, rowCount - sourceRow)
      const sourceOffset = sourceRow * this.width * 3
      const targetOffset = this.bandRows * this.width * 3
      this.rowBand.set(
        rows.subarray(sourceOffset, sourceOffset + rowsToCopy * this.width * 3),
        targetOffset,
      )
      this.bandRows += rowsToCopy
      sourceRow += rowsToCopy

      if (this.bandRows === 8) {
        this.encodeBand(8)
        this.bandRows = 0
      }
    }
  }

  async finish() {
    if (this.aborted) {
      throw new Error('JPEG_RUNTIME_ABORTED')
    }
    if (this.finished) {
      throw new Error('JPEG_RUNTIME_FINISHED')
    }

    if (this.bandRows > 0) {
      this.encodeBand(this.bandRows)
      this.bandRows = 0
    }

    this.writer.flushBits()
    this.writer.writeMarker(0xD9)
    this.finished = true

    return this.writer.toBlob()
  }

  abort() {
    this.aborted = true
    this.bandRows = 0
    this.writer.clear()
  }

  private writeHeaders() {
    this.writer.writeMarker(0xD8)
    this.writeApp0()
    this.writeDqt(0, this.lumaQuant)
    this.writeDqt(1, this.chromaQuant)
    this.writeSof0()
    this.writeDht(0, 0, LUMA_DC_BITS, LUMA_DC_VALUES)
    this.writeDht(1, 0, LUMA_AC_BITS, LUMA_AC_VALUES)
    this.writeDht(0, 1, CHROMA_DC_BITS, CHROMA_DC_VALUES)
    this.writeDht(1, 1, CHROMA_AC_BITS, CHROMA_AC_VALUES)
    this.writeSos()
  }

  private writeApp0() {
    this.writer.writeMarker(0xE0)
    this.writer.writeWord(16)
    this.writer.writeString('JFIF\0')
    this.writer.writeByte(1)
    this.writer.writeByte(1)
    this.writer.writeByte(0)
    this.writer.writeWord(1)
    this.writer.writeWord(1)
    this.writer.writeByte(0)
    this.writer.writeByte(0)
  }

  private writeDqt(id: number, table: number[]) {
    this.writer.writeMarker(0xDB)
    this.writer.writeWord(67)
    this.writer.writeByte(id)
    for (const index of ZIGZAG) {
      this.writer.writeByte(table[index])
    }
  }

  private writeSof0() {
    this.writer.writeMarker(0xC0)
    this.writer.writeWord(17)
    this.writer.writeByte(8)
    this.writer.writeWord(this.height)
    this.writer.writeWord(this.width)
    this.writer.writeByte(3)
    this.writer.writeByte(1)
    this.writer.writeByte(0x11)
    this.writer.writeByte(0)
    this.writer.writeByte(2)
    this.writer.writeByte(0x11)
    this.writer.writeByte(1)
    this.writer.writeByte(3)
    this.writer.writeByte(0x11)
    this.writer.writeByte(1)
  }

  private writeDht(
    tableClass: number,
    id: number,
    bits: number[],
    values: number[],
  ) {
    this.writer.writeMarker(0xC4)
    this.writer.writeWord(3 + bits.length + values.length)
    this.writer.writeByte((tableClass << 4) | id)
    for (const count of bits) {
      this.writer.writeByte(count)
    }
    for (const value of values) {
      this.writer.writeByte(value)
    }
  }

  private writeSos() {
    this.writer.writeMarker(0xDA)
    this.writer.writeWord(12)
    this.writer.writeByte(3)
    this.writer.writeByte(1)
    this.writer.writeByte(0x00)
    this.writer.writeByte(2)
    this.writer.writeByte(0x11)
    this.writer.writeByte(3)
    this.writer.writeByte(0x11)
    this.writer.writeByte(0)
    this.writer.writeByte(63)
    this.writer.writeByte(0)
  }

  private encodeBand(rowCount: number) {
    const horizontalBlocks = Math.ceil(this.width / 8)

    for (let blockX = 0; blockX < horizontalBlocks; blockX += 1) {
      this.encodeComponentBlock(blockX, rowCount, 0)
      this.encodeComponentBlock(blockX, rowCount, 1)
      this.encodeComponentBlock(blockX, rowCount, 2)
    }
  }

  private encodeComponentBlock(
    blockX: number,
    rowCount: number,
    component: 0 | 1 | 2,
  ) {
    for (let y = 0; y < 8; y += 1) {
      const sourceY = Math.min(y, rowCount - 1)
      for (let x = 0; x < 8; x += 1) {
        const sourceX = Math.min(blockX * 8 + x, this.width - 1)
        const offset = (sourceY * this.width + sourceX) * 3
        const red = this.rowBand[offset]
        const green = this.rowBand[offset + 1]
        const blue = this.rowBand[offset + 2]

        this.block[y * 8 + x] = this.rgbToComponent(red, green, blue, component)
      }
    }

    const quant = component === 0 ? this.lumaQuant : this.chromaQuant
    this.forwardDctAndQuantize(quant)
    this.encodeQuantizedBlock(
      component,
      component === 0 ? this.lumaDc : this.chromaDc,
      component === 0 ? this.lumaAc : this.chromaAc,
    )
  }

  private rgbToComponent(
    red: number,
    green: number,
    blue: number,
    component: 0 | 1 | 2,
  ) {
    if (component === 0) {
      return clampByte(0.299 * red + 0.587 * green + 0.114 * blue) - 128
    }
    if (component === 1) {
      return (
        clampByte(-0.168736 * red - 0.331264 * green + 0.5 * blue + 128) - 128
      )
    }
    return clampByte(0.5 * red - 0.418688 * green - 0.081312 * blue + 128) - 128
  }

  private forwardDctAndQuantize(quant: number[]) {
    for (let v = 0; v < 8; v += 1) {
      for (let u = 0; u < 8; u += 1) {
        let sum = 0
        for (let y = 0; y < 8; y += 1) {
          for (let x = 0; x < 8; x += 1) {
            sum += this.block[y * 8 + x] * COSINES[x][u] * COSINES[y][v]
          }
        }

        const dct = 0.25 * DCT_SCALE[u] * DCT_SCALE[v] * sum
        this.coefficients[v * 8 + u] = Math.round(dct / quant[v * 8 + u])
      }
    }
  }

  private encodeQuantizedBlock(
    component: 0 | 1 | 2,
    dcTable: HuffmanTable,
    acTable: HuffmanTable,
  ) {
    const dc = this.coefficients[0]
    const diff = dc - this.previousDc[component]
    this.previousDc[component] = dc

    this.writeHuffmanValue(dcTable, category(diff))
    const dcCategory = category(diff)
    if (dcCategory > 0) {
      this.writer.writeBits(amplitudeBits(diff, dcCategory), dcCategory)
    }

    let zeroRun = 0
    let lastNonZero = 0
    for (let i = 63; i > 0; i -= 1) {
      if (this.coefficients[ZIGZAG[i]] !== 0) {
        lastNonZero = i
        break
      }
    }

    for (let i = 1; i <= lastNonZero; i += 1) {
      const value = this.coefficients[ZIGZAG[i]]
      if (value === 0) {
        zeroRun += 1
        continue
      }

      while (zeroRun >= 16) {
        this.writeHuffmanValue(acTable, 0xF0)
        zeroRun -= 16
      }

      const acCategory = category(value)
      this.writeHuffmanValue(acTable, (zeroRun << 4) | acCategory)
      this.writer.writeBits(amplitudeBits(value, acCategory), acCategory)
      zeroRun = 0
    }

    if (lastNonZero < 63) {
      this.writeHuffmanValue(acTable, 0)
    }
  }

  private writeHuffmanValue(table: HuffmanTable, value: number) {
    const code = table.get(value)
    if (!code) {
      throw new Error(`JPEG_HUFFMAN_VALUE_UNAVAILABLE:${value}`)
    }
    this.writer.writeBits(code.code, code.length)
  }
}

export function createBaselineJpegEncoder(input: {
  width: number
  height: number
  quality: number
}): InternalJpegEncoder {
  return new BaselineSequentialJpegEncoder(
    input.width,
    input.height,
    input.quality,
  )
}
