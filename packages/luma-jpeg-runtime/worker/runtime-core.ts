export type JpegWorkerRequest =
  | {
      id: string
      type: 'create'
      payload: { width: number; height: number; quality: number }
    }
  | {
      id: string
      type: 'rows'
      payload: { rows: Uint8Array; rowCount: number }
    }
  | { id: string; type: 'finish'; payload: Record<string, never> }
  | { id: string; type: 'abort'; payload: Record<string, never> }

export type JpegWorkerResponse =
  | {
      id: string
      ok: true
      type: 'create'
      payload: { created: true }
    }
  | {
      id: string
      ok: true
      type: 'rows'
      payload: { writtenRows: number }
    }
  | {
      id: string
      ok: true
      type: 'finish'
      payload: { blob: Blob }
    }
  | {
      id: string
      ok: true
      type: 'abort'
      payload: { aborted: true }
    }

export type InternalJpegEncoder = {
  writeRows: (rows: Uint8Array, rowCount: number) => Promise<void>
  finish: () => Promise<Blob>
  abort: () => void
}

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26,
  33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57,
  50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39,
  46, 53, 60, 61, 54, 47, 55, 62, 63,
]

const LUMA_Q = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13,
  16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56,
  68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103,
  121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]

const CHROMA_Q = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26,
  56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
]

const LUMA_DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]
const CHROMA_DC_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]
const LUMA_DC_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const CHROMA_DC_VALUES = LUMA_DC_VALUES

const LUMA_AC_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d]
const CHROMA_AC_BITS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77]
const LUMA_AC_VALUES = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
  0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
  0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
  0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
  0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
  0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
  0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
]
const CHROMA_AC_VALUES = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41,
  0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
  0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1,
  0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44,
  0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
  0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74,
  0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a,
  0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
  0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7,
  0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
]

const COSINES = Array.from({ length: 8 }, (_, x) =>
  Array.from({ length: 8 }, (_, u) => Math.cos(((2 * x + 1) * u * Math.PI) / 16)),
)
const DCT_SCALE = Array.from({ length: 8 }, (_, i) => (i === 0 ? 1 / Math.SQRT2 : 1))

type HuffmanCode = { code: number; length: number }
type HuffmanTable = Map<number, HuffmanCode>

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0
}

function isValidJpegQuality(value: number) {
  return Number.isFinite(value) && value > 0 && value <= 1
}

function clampByte(value: number) {
  return Math.min(255, Math.max(0, value))
}

function scaledQuantTable(base: number[], quality: number) {
  const qualityLevel = Math.min(100, Math.max(1, Math.round(quality * 100)))
  const scale = qualityLevel < 50 ? 5000 / qualityLevel : 200 - qualityLevel * 2

  return base.map((value) => Math.min(255, Math.max(1, Math.floor((value * scale + 50) / 100))))
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

class JpegByteWriter {
  private readonly chunks: Uint8Array[] = []
  private buffer: number[] = []
  private bitBuffer = 0
  private bitCount = 0

  writeByte(value: number) {
    this.buffer.push(value & 0xff)
    if (this.buffer.length >= 16384) {
      this.flushBuffer()
    }
  }

  writeWord(value: number) {
    this.writeByte(value >> 8)
    this.writeByte(value)
  }

  writeMarker(marker: number) {
    this.writeByte(0xff)
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
      const byte = (this.bitBuffer >> (this.bitCount - 8)) & 0xff
      this.writeByte(byte)
      if (byte === 0xff) {
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
    const byte = ((this.bitBuffer << padding) | ((1 << padding) - 1)) & 0xff
    this.writeByte(byte)
    if (byte === 0xff) {
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

    this.chunks.push(Uint8Array.from(this.buffer))
    this.buffer = []
  }
}

class BaselineSequentialJpegEncoder implements InternalJpegEncoder {
  private readonly writer = new JpegByteWriter()
  private readonly rowBand: Uint8Array
  private readonly lumaQuant: number[]
  private readonly chromaQuant: number[]
  private readonly lumaDc = buildHuffmanTable(LUMA_DC_BITS, LUMA_DC_VALUES)
  private readonly chromaDc = buildHuffmanTable(CHROMA_DC_BITS, CHROMA_DC_VALUES)
  private readonly lumaAc = buildHuffmanTable(LUMA_AC_BITS, LUMA_AC_VALUES)
  private readonly chromaAc = buildHuffmanTable(CHROMA_AC_BITS, CHROMA_AC_VALUES)
  private readonly block = new Array<number>(64).fill(0)
  private readonly coefficients = new Array<number>(64).fill(0)
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
    this.writer.writeMarker(0xd9)
    this.finished = true

    return this.writer.toBlob()
  }

  abort() {
    this.aborted = true
    this.bandRows = 0
    this.writer.clear()
  }

  private writeHeaders() {
    this.writer.writeMarker(0xd8)
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
    this.writer.writeMarker(0xe0)
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
    this.writer.writeMarker(0xdb)
    this.writer.writeWord(67)
    this.writer.writeByte(id)
    for (const index of ZIGZAG) {
      this.writer.writeByte(table[index])
    }
  }

  private writeSof0() {
    this.writer.writeMarker(0xc0)
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

  private writeDht(tableClass: number, id: number, bits: number[], values: number[]) {
    this.writer.writeMarker(0xc4)
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
    this.writer.writeMarker(0xda)
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

  private encodeComponentBlock(blockX: number, rowCount: number, component: 0 | 1 | 2) {
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

  private rgbToComponent(red: number, green: number, blue: number, component: 0 | 1 | 2) {
    if (component === 0) {
      return clampByte(0.299 * red + 0.587 * green + 0.114 * blue) - 128
    }
    if (component === 1) {
      return clampByte(-0.168736 * red - 0.331264 * green + 0.5 * blue + 128) - 128
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

  private encodeQuantizedBlock(component: 0 | 1 | 2, dcTable: HuffmanTable, acTable: HuffmanTable) {
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
        this.writeHuffmanValue(acTable, 0xf0)
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

function createBaselineJpegEncoder(options: {
  width: number
  height: number
  quality: number
}): InternalJpegEncoder {
  return new BaselineSequentialJpegEncoder(options.width, options.height, options.quality)
}

export function createJpegRuntimeCore(
  encoderFactory: (options: {
    width: number
    height: number
    quality: number
  }) => InternalJpegEncoder = createBaselineJpegEncoder,
) {
  let width = 0
  let height = 0
  let writtenRows = 0
  let state: 'idle' | 'ready' | 'finished' | 'aborted' = 'idle'
  let encoder: InternalJpegEncoder | undefined

  function assertReady() {
    if (state === 'idle') {
      throw new Error('JPEG_RUNTIME_NOT_CREATED')
    }
    if (state === 'finished') {
      throw new Error('JPEG_RUNTIME_FINISHED')
    }
    if (state === 'aborted') {
      throw new Error('JPEG_RUNTIME_ABORTED')
    }
    if (!encoder) {
      throw new Error('JPEG_RUNTIME_NOT_CREATED')
    }
  }

  return {
    async handleRequest(request: JpegWorkerRequest): Promise<JpegWorkerResponse> {
      if (request.type === 'create') {
        if (!isPositiveInteger(request.payload.width)) {
          throw new Error('JPEG_INVALID_WIDTH')
        }
        if (!isPositiveInteger(request.payload.height)) {
          throw new Error('JPEG_INVALID_HEIGHT')
        }
        if (!isValidJpegQuality(request.payload.quality)) {
          throw new Error('JPEG_INVALID_QUALITY')
        }

        width = request.payload.width
        height = request.payload.height
        writtenRows = 0
        encoder = encoderFactory(request.payload)
        state = 'ready'

        return {
          id: request.id,
          ok: true,
          type: request.type,
          payload: { created: true },
        }
      }

      if (request.type === 'rows') {
        assertReady()

        if (!isPositiveInteger(request.payload.rowCount)) {
          throw new Error('JPEG_INVALID_ROW_COUNT')
        }
        if (request.payload.rows.length !== width * request.payload.rowCount * 3) {
          throw new Error('JPEG_ROW_LENGTH_MISMATCH')
        }
        if (writtenRows + request.payload.rowCount > height) {
          throw new Error('JPEG_ROW_COUNT_EXCEEDED')
        }

        await encoder.writeRows(request.payload.rows, request.payload.rowCount)
        writtenRows += request.payload.rowCount

        return {
          id: request.id,
          ok: true,
          type: request.type,
          payload: { writtenRows },
        }
      }

      if (request.type === 'finish') {
        assertReady()

        if (writtenRows !== height) {
          throw new Error('JPEG_INCOMPLETE_IMAGE')
        }

        const blob = await encoder.finish()
        state = 'finished'

        return {
          id: request.id,
          ok: true,
          type: request.type,
          payload: { blob },
        }
      }

      assertReady()
      encoder.abort()
      writtenRows = 0
      state = 'aborted'

      return {
        id: request.id,
        ok: true,
        type: request.type,
        payload: { aborted: true },
      }
    },
  }
}
