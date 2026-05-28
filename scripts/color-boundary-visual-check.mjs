import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { deflateSync } from 'node:zlib'

import {
  createRowBandProcessor,
  mat3Identity,
} from '@lumaforge/luma-color-runtime'

const WIDTH = 160
const BAND_HEIGHT = 28
const GAP = 2
const HEIGHT = BAND_HEIGHT * 4 + GAP * 3

const BOUNDARY_PROFILE = {
  id: 'visual-linear-boundary-probe',
  label: 'Visual Linear Boundary Probe',
  role: 'scene-creative',
  inputGamut: 'prophoto-rgb',
  inputTransfer: 'linear',
  inputRange: 'full',
  outputGamut: 'srgb-rec709',
  outputTransfer: 'linear',
  outputRange: 'full',
  aliases: [],
}

function neutralToneSteps() {
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

function makeRedRampLut({ signedOutput = false } = {}) {
  const lut = new Float32Array(2 * 2 * 2 * 3)

  for (let blue = 0; blue < 2; blue += 1) {
    for (let green = 0; green < 2; green += 1) {
      for (let red = 0; red < 2; red += 1) {
        const index = ((blue * 2 + green) * 2 + red) * 3
        const value = signedOutput ? -red : red
        lut[index] = value
        lut[index + 1] = signedOutput ? 0 : value
        lut[index + 2] = signedOutput ? 0 : value
      }
    }
  }

  return lut
}

function makeBoundaryGraph({
  data,
  domainMin = [0, 0, 0],
  domainMax = [1, 1, 1],
  outputMatrix = mat3Identity(),
}) {
  return {
    supported: true,
    outputGamut: 'srgb-rec709',
    outputTransfer: 'srgb',
    lutProfile: BOUNDARY_PROFILE,
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
      { kind: 'lut3d', size: 2, data, domainMin, domainMax },
      {
        kind: 'lut-output-to-srgb',
        matrix: outputMatrix,
        transfer: 'linear',
        range: 'full',
        role: 'scene-creative',
        intensity: 1,
      },
      { kind: 'output-srgb' },
    ],
  }
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function linearToSrgb(linear) {
  const clamped = Math.max(0, linear)
  return clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
}

function toSrgbByte(linear) {
  return Math.round(clamp01(linearToSrgb(linear)) * 255)
}

function renderSignedInputRuntime() {
  const processor = createRowBandProcessor({
    width: WIDTH,
    rowBandRows: 1,
    graph: makeBoundaryGraph({
      data: makeRedRampLut(),
      domainMin: [-1, 0, 0],
      domainMax: [1, 1, 1],
    }),
  })
  const source = new Float32Array(WIDTH * 3)

  for (let x = 0; x < WIDTH; x += 1) {
    source[x * 3] = -1 + (2 * x) / (WIDTH - 1)
  }

  return processor.processFloatRows(source, 1)
}

function renderSignedInputClampReference() {
  const bytes = new Uint8Array(WIDTH * 3)

  for (let x = 0; x < WIDTH; x += 1) {
    const source = -1 + (2 * x) / (WIDTH - 1)
    const normalized = (Math.max(source, 0) + 1) / 2
    const byte = toSrgbByte(normalized)
    bytes[x * 3] = byte
    bytes[x * 3 + 1] = byte
    bytes[x * 3 + 2] = byte
  }

  return bytes
}

function renderSignedOutputRuntime() {
  const processor = createRowBandProcessor({
    width: WIDTH,
    rowBandRows: 1,
    graph: makeBoundaryGraph({
      data: makeRedRampLut({ signedOutput: true }),
      outputMatrix: new Float32Array([-1, 0, 0, 0, 1, 0, 0, 0, 1]),
    }),
  })
  const source = new Float32Array(WIDTH * 3)

  for (let x = 0; x < WIDTH; x += 1) {
    source[x * 3] = x / (WIDTH - 1)
  }

  return processor.processFloatRows(source, 1)
}

function renderSignedOutputClampReference() {
  return new Uint8Array(WIDTH * 3)
}

function copyBand(rgba, bandIndex, rgb) {
  const yStart = bandIndex * (BAND_HEIGHT + GAP)

  for (let y = 0; y < BAND_HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const source = x * 3
      const target = ((yStart + y) * WIDTH + x) * 4
      rgba[target] = rgb[source]
      rgba[target + 1] = rgb[source + 1]
      rgba[target + 2] = rgb[source + 2]
      rgba[target + 3] = 255
    }
  }
}

function makeCrc32Table() {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 3988292384 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
}

const CRC32_TABLE = makeCrc32Table()

function crc32(buffer) {
  let crc = 4294967295
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8)
  }
  return (crc ^ 4294967295) >>> 0
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const scanlines = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1)
    scanlines[rowStart] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(
      scanlines,
      rowStart + 1,
    )
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const signedInputRuntime = renderSignedInputRuntime()
const signedInputClamp = renderSignedInputClampReference()
const signedOutputRuntime = renderSignedOutputRuntime()
const signedOutputClamp = renderSignedOutputClampReference()

if (signedInputRuntime[0] >= signedInputClamp[0]) {
  throw new Error('SIGNED_INPUT_BOUNDARY_DID_NOT_RETAIN_NEGATIVE_DOMAIN')
}
if (signedOutputRuntime[WIDTH * 3 - 3] <= signedOutputClamp[WIDTH * 3 - 3]) {
  throw new Error('SIGNED_OUTPUT_BOUNDARY_DID_NOT_SURVIVE_MATRIX')
}

const rgba = new Uint8Array(WIDTH * HEIGHT * 4)
rgba.fill(255)
copyBand(rgba, 0, signedInputRuntime)
copyBand(rgba, 1, signedInputClamp)
copyBand(rgba, 2, signedOutputRuntime)
copyBand(rgba, 3, signedOutputClamp)

const outputDir =
  process.env.COLOR_BOUNDARY_VISUAL_DIR ??
  '/tmp/lumaforge-color-boundary-visual'
await mkdir(outputDir, { recursive: true })
const outputPath = join(outputDir, 'color-boundary-comparison.png')
await writeFile(outputPath, encodePng(WIDTH, HEIGHT, rgba))

const report = JSON.stringify(
  {
    outputPath,
    width: WIDTH,
    height: HEIGHT,
    bands: [
      'runtime signed LUT input domain',
      'legacy clamp signed LUT input reference',
      'runtime signed LUT output through matrix',
      'legacy clamp signed LUT output reference',
    ],
    samples: {
      signedInputRuntimeStart: signedInputRuntime[0],
      signedInputClampStart: signedInputClamp[0],
      signedOutputRuntimeEnd: signedOutputRuntime[WIDTH * 3 - 3],
      signedOutputClampEnd: signedOutputClamp[WIDTH * 3 - 3],
    },
  },
  null,
  2,
)

process.stdout.write(`${report}\n`)
