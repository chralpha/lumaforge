import type {
  LumaRawExportCapability,
  LumaRawProcessedWindow,
  LumaRawProcessedWindowRequest,
} from '@lumaforge/luma-raw-runtime'

import { mat3Identity } from '~/lib/color/matrix'

import { runFullResolutionJpegExport } from './full-res-export'
import { createWasmJpegRowSink } from './jpeg/wasm-row-sink'

function makeCapability(
  overrides: Partial<LumaRawExportCapability> = {},
): LumaRawExportCapability {
  return {
    supported: overrides.supported ?? true,
    strategy: overrides.strategy ?? 'libraw-processed-window',
    width: overrides.width ?? 4,
    height: overrides.height ?? 4,
    rawWidth: overrides.rawWidth ?? 4,
    rawHeight: overrides.rawHeight ?? 4,
    visibleCrop:
      'visibleCrop' in overrides
        ? overrides.visibleCrop
        : { x: 0, y: 0, width: 4, height: 4 },
    cfa: overrides.cfa ?? { pattern: 'rggb', xPhase: 0, yPhase: 0 },
    blackLevel: overrides.blackLevel ?? 0,
    whiteLevel: overrides.whiteLevel ?? 255,
    orientation:
      'orientation' in overrides
        ? overrides.orientation
        : { code: 1, supported: true },
    color:
      'color' in overrides
        ? overrides.color
        : {
            workingSpace: 'linear-prophoto-rgb',
            librawOutputColor: 'prophoto',
            gamma: 'linear',
            cameraWhiteBalanceAppliedByRuntime: true,
            cameraMatrixAppliedByRuntime: true,
          },
    sensor: overrides.sensor ?? {
      layout: 'bayer',
      colorCount: 3,
      cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
      phaseIsWindowLocal: false,
    },
    levels: overrides.levels,
    windows: overrides.windows ?? { librawProcessed: true, rawMosaic: false },
    diagnostics: overrides.diagnostics ?? {
      hasRawImage: true,
      hasColor3Image: false,
      hasColor4Image: false,
      hasXTransTable: false,
    },
    reasons: overrides.reasons ?? [],
  }
}

function makeProcessedWindow(
  request: LumaRawProcessedWindowRequest,
  value = 32768,
): LumaRawProcessedWindow {
  return {
    rect: request.outputRect,
    workingSpace: 'linear-prophoto-rgb',
    data: new Uint16Array(
      request.outputRect.width * request.outputRect.height * 3,
    ).fill(value),
    width: request.outputRect.width,
    height: request.outputRect.height,
    stride: request.outputRect.width * 3,
    normalized: false,
    orientationApplied: true,
    colorApplied: true,
    warnings: [],
  }
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function linearToSrgb(value: number) {
  const clamped = Math.max(0, value)
  return clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
}

const IDENTITY_RAW_RENDER_EXPOSURE_STEP = {
  kind: 'raw-render-exposure' as const,
  ev: 0,
  multiplier: 1,
}

describe('runFullResolutionJpegExport', () => {
  it('throws FULL_RES_EXPORT_UNSUPPORTED_SOURCE before opening writer or reading windows', async () => {
    const readProcessedWindow = vi.fn()
    const createSession = vi.fn(() => ({
      writeRows: vi.fn(),
      close: vi.fn(),
      abort: vi.fn(),
    }))
    const jpegSink = {
      createSession,
    }

    await expect(
      runFullResolutionJpegExport({
        capability: makeCapability({ supported: false }),
        graph: {
          supported: true,
          outputGamut: 'srgb-rec709',
          outputTransfer: 'srgb',
          lutProfile: null,
          steps: [
            { kind: 'input-linear-prophoto' },
            IDENTITY_RAW_RENDER_EXPOSURE_STEP,
            { kind: 'output-srgb' },
          ],
        },
        readProcessedWindow,
        jpegSink,
      }),
    ).rejects.toThrow('FULL_RES_EXPORT_UNSUPPORTED_SOURCE')

    expect(readProcessedWindow).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })

  it.each([
    ['missing color facts', { color: undefined }],
    [
      'raw-mosaic strategy',
      {
        strategy: 'raw-mosaic-window',
        windows: { librawProcessed: false, rawMosaic: true },
      },
    ],
    [
      'missing processed windows',
      {
        windows: { librawProcessed: false, rawMosaic: true },
      },
    ],
    [
      'unsupported working space',
      {
        color: {
          whiteBalance: [1, 1, 1, 1],
          cameraToWorkingRgb: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          workingSpace: 'display-srgb-preview',
        },
      },
    ],
    [
      'runtime camera white balance not applied',
      {
        color: {
          workingSpace: 'linear-prophoto-rgb',
          librawOutputColor: 'prophoto',
          gamma: 'linear',
          cameraWhiteBalanceAppliedByRuntime: false,
          cameraMatrixAppliedByRuntime: true,
        },
      },
    ],
    [
      'runtime camera matrix not applied',
      {
        color: {
          workingSpace: 'linear-prophoto-rgb',
          librawOutputColor: 'prophoto',
          gamma: 'linear',
          cameraWhiteBalanceAppliedByRuntime: true,
          cameraMatrixAppliedByRuntime: false,
        },
      },
    ],
  ] as Array<[string, Partial<LumaRawExportCapability>]>)(
    'fails closed before scheduling for %s',
    async (_name, overrides) => {
      const readProcessedWindow = vi.fn()
      const createSession = vi.fn(() => ({
        writeRows: vi.fn(),
        close: vi.fn(),
        abort: vi.fn(),
      }))

      await expect(
        runFullResolutionJpegExport({
          capability: makeCapability(overrides),
          graph: {
            supported: true,
            outputGamut: 'srgb-rec709',
            outputTransfer: 'srgb',
            lutProfile: null,
            steps: [
              { kind: 'input-linear-prophoto' },
              IDENTITY_RAW_RENDER_EXPOSURE_STEP,
              { kind: 'output-srgb' },
            ],
          },
          readProcessedWindow,
          jpegSink: {
            createSession,
          },
        }),
      ).rejects.toThrow('FULL_RES_EXPORT_UNSUPPORTED_SOURCE')

      expect(readProcessedWindow).not.toHaveBeenCalled()
      expect(createSession).not.toHaveBeenCalled()
    },
  )

  it('reports strip progress and returns the JPEG blob', async () => {
    const progress: number[] = []
    const writtenRows: Array<{ rowCount: number; bytes: Uint8Array }> = []
    const readProcessedWindow = vi.fn(
      (request: LumaRawProcessedWindowRequest) =>
        Promise.resolve(makeProcessedWindow(request)),
    )
    const writer = {
      writeRows: vi.fn(async (bytes: Uint8Array, rowCount: number) => {
        writtenRows.push({ rowCount, bytes: new Uint8Array(bytes) })
      }),
      close: vi.fn(
        async () =>
          new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
      ),
      abort: vi.fn(async () => undefined),
    }

    const blob = await runFullResolutionJpegExport({
      capability: makeCapability(),
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [
          { kind: 'input-linear-prophoto' },
          IDENTITY_RAW_RENDER_EXPOSURE_STEP,
          { kind: 'output-srgb' },
        ],
      },
      preferredRows: 2,
      readProcessedWindow,
      writerFactory: () => writer,
      onProgress(entry) {
        progress.push(entry.progress)
      },
    })

    expect(blob.type).toBe('image/jpeg')
    expect(readProcessedWindow).toHaveBeenCalledTimes(1)
    expect(writtenRows).toHaveLength(1)
    expect(writtenRows[0]?.rowCount).toBe(4)
    expect(writtenRows[0]?.bytes).toEqual(new Uint8Array(4 * 4 * 3).fill(188))
    expect(progress.at(-1)).toBe(100)
  })

  it('decodes BT.709 LUT output before final sRGB JPEG encoding', async () => {
    const bt709EncodedGray = 0.4090077
    const lut = new Float32Array(2 * 2 * 2 * 3)
    lut.fill(bt709EncodedGray)
    const writtenRows: Array<{ bytes: Uint8Array; rowCount: number }> = []
    const writer = {
      writeRows: vi.fn(async (bytes: Uint8Array, rowCount: number) => {
        writtenRows.push({ bytes: new Uint8Array(bytes), rowCount })
      }),
      close: vi.fn(async () => new Blob([], { type: 'image/jpeg' })),
      abort: vi.fn(async () => undefined),
    }

    await runFullResolutionJpegExport({
      capability: makeCapability({
        width: 2,
        height: 1,
        rawWidth: 2,
        rawHeight: 1,
        visibleCrop: { x: 0, y: 0, width: 2, height: 1 },
      }),
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [
          { kind: 'input-linear-prophoto' },
          IDENTITY_RAW_RENDER_EXPOSURE_STEP,
          {
            kind: 'gamut-to-lut-input',
            matrix: mat3Identity(),
            gamut: 'v-gamut',
          },
          { kind: 'encode-lut-transfer', transfer: 'v-log', range: 'full' },
          {
            kind: 'lut3d',
            size: 2,
            data: lut,
            domainMin: [0, 0, 0],
            domainMax: [1, 1, 1],
          },
          {
            kind: 'lut-output-to-srgb',
            matrix: mat3Identity(),
            transfer: 'bt709',
            range: 'full',
            role: 'combined-look-output',
            intensity: 1,
          },
          { kind: 'output-srgb' },
        ],
      },
      readProcessedWindow: vi.fn((request: LumaRawProcessedWindowRequest) =>
        Promise.resolve(makeProcessedWindow(request, 32768)),
      ),
      writerFactory: () => writer,
    })

    const bt709Linear = Math.pow((bt709EncodedGray + 0.099) / 1.099, 1 / 0.45)
    const expected = Math.round(linearToSrgb(bt709Linear) * 255)
    const encodedByte = Math.round(bt709EncodedGray * 255)

    expect(writtenRows).toHaveLength(1)
    expect(writtenRows[0]?.rowCount).toBe(1)
    expect(writtenRows[0]?.bytes).toHaveLength(6)
    expect(writtenRows[0]?.bytes.slice(0, 3)).toEqual(
      new Uint8Array([expected, expected, expected]),
    )
    expect(writtenRows[0]?.bytes.slice(3, 6)).toEqual(
      new Uint8Array([expected, expected, expected]),
    )
    expect(writtenRows[0]?.bytes[0]).not.toBe(encodedByte)
  })

  it('applies raw render exposure before final sRGB encoding', async () => {
    const writtenRows: Array<{ bytes: Uint8Array }> = []
    const writer = {
      writeRows: vi.fn(async (bytes: Uint8Array) => {
        writtenRows.push({ bytes: new Uint8Array(bytes) })
      }),
      close: vi.fn(async () => new Blob([], { type: 'image/jpeg' })),
      abort: vi.fn(async () => undefined),
    }

    await runFullResolutionJpegExport({
      capability: makeCapability(),
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [
          { kind: 'input-linear-prophoto' },
          { kind: 'raw-render-exposure', ev: 1, multiplier: 2 },
          { kind: 'output-srgb' },
        ],
      },
      readProcessedWindow: vi.fn((request: LumaRawProcessedWindowRequest) =>
        Promise.resolve(makeProcessedWindow(request, 16384)),
      ),
      writerFactory: () => writer,
    })

    const expected = Math.round(linearToSrgb(0.5) * 255)
    const unexposed = Math.round(linearToSrgb(0.25) * 255)

    expect(writtenRows[0]?.bytes[0]).toBe(expected)
    expect(writtenRows[0]?.bytes[0]).not.toBe(unexposed)
  })

  it('applies raw render exposure before scene LUT input and base mixing', async () => {
    const intensity = 0.5
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

    const writtenRows: Array<{ bytes: Uint8Array }> = []
    const writer = {
      writeRows: vi.fn(async (bytes: Uint8Array) => {
        writtenRows.push({ bytes: new Uint8Array(bytes) })
      }),
      close: vi.fn(async () => new Blob([], { type: 'image/jpeg' })),
      abort: vi.fn(async () => undefined),
    }

    await runFullResolutionJpegExport({
      capability: makeCapability(),
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [
          { kind: 'input-linear-prophoto' },
          { kind: 'raw-render-exposure', ev: 1, multiplier: 2 },
          {
            kind: 'gamut-to-lut-input',
            matrix: mat3Identity(),
            gamut: 'prophoto-rgb',
          },
          { kind: 'encode-lut-transfer', transfer: 'linear', range: 'full' },
          {
            kind: 'lut3d',
            size: 2,
            data: lut,
            domainMin: [0, 0, 0],
            domainMax: [0.5, 0.5, 0.5],
          },
          {
            kind: 'lut-output-to-srgb',
            matrix: mat3Identity(),
            transfer: 'linear',
            range: 'full',
            role: 'scene-creative',
            intensity,
          },
          { kind: 'output-srgb' },
        ],
      },
      readProcessedWindow: vi.fn((request: LumaRawProcessedWindowRequest) =>
        Promise.resolve(makeProcessedWindow(request, 16384)),
      ),
      writerFactory: () => writer,
    })

    const unexposedBaseLinear = 16384 / 65535
    const exposedBaseLinear = unexposedBaseLinear * 2
    const expectedLinear =
      exposedBaseLinear + (1 - exposedBaseLinear) * intensity
    const ignoresExposureForLutInput =
      exposedBaseLinear + (0.5 - exposedBaseLinear) * intensity
    const ignoresExposureForBaseMix =
      unexposedBaseLinear + (1 - unexposedBaseLinear) * intensity
    const expected = Math.round(clamp01(linearToSrgb(expectedLinear)) * 255)

    expect(writtenRows[0]?.bytes[0]).toBe(expected)
    expect(writtenRows[0]?.bytes[0]).not.toBe(
      Math.round(clamp01(linearToSrgb(ignoresExposureForLutInput)) * 255),
    )
    expect(writtenRows[0]?.bytes[0]).not.toBe(
      Math.round(clamp01(linearToSrgb(ignoresExposureForBaseMix)) * 255),
    )
  })

  it.each([Infinity, -Infinity, Number.NaN, 0, -1])(
    'fails closed for invalid preferred row count %s before reading processed windows',
    async (preferredRows) => {
      const readProcessedWindow = vi.fn()
      const writer = {
        writeRows: vi.fn(),
        close: vi.fn(),
        abort: vi.fn(async () => undefined),
      }

      await expect(
        runFullResolutionJpegExport({
          capability: makeCapability(),
          graph: {
            supported: true,
            outputGamut: 'srgb-rec709',
            outputTransfer: 'srgb',
            lutProfile: null,
            steps: [
              { kind: 'input-linear-prophoto' },
              IDENTITY_RAW_RENDER_EXPOSURE_STEP,
              { kind: 'output-srgb' },
            ],
          },
          preferredRows,
          readProcessedWindow,
          writerFactory: () => writer,
        }),
      ).rejects.toThrow('FULL_RES_EXPORT_INVALID_PREFERRED_ROWS')

      expect(readProcessedWindow).not.toHaveBeenCalled()
      expect(writer.writeRows).not.toHaveBeenCalled()
      expect(writer.abort).not.toHaveBeenCalled()
    },
  )

  it('normalizes fractional preferred rows before scheduling processed windows', async () => {
    const writtenRows: number[] = []
    const readProcessedWindow = vi.fn(
      (request: LumaRawProcessedWindowRequest) =>
        Promise.resolve(makeProcessedWindow(request)),
    )
    const writer = {
      writeRows: vi.fn(async (_bytes: Uint8Array, rowCount: number) => {
        writtenRows.push(rowCount)
      }),
      close: vi.fn(async () => new Blob([], { type: 'image/jpeg' })),
      abort: vi.fn(async () => undefined),
    }

    await runFullResolutionJpegExport({
      capability: makeCapability({
        height: 130,
        rawHeight: 130,
        visibleCrop: { x: 0, y: 0, width: 4, height: 130 },
      }),
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [
          { kind: 'input-linear-prophoto' },
          IDENTITY_RAW_RENDER_EXPOSURE_STEP,
          { kind: 'output-srgb' },
        ],
      },
      preferredRows: 64.5,
      readProcessedWindow,
      writerFactory: () => writer,
    })

    expect(
      readProcessedWindow.mock.calls.map(
        ([request]) => request.outputRect.height,
      ),
    ).toEqual([64, 64, 2])
    expect(writtenRows).toEqual([64, 64, 2])
  })

  it('maps full export strips to processed windows and writes requested output rows', async () => {
    const writtenRows: number[] = []
    const readProcessedWindow = vi.fn(
      (request: LumaRawProcessedWindowRequest) =>
        Promise.resolve(makeProcessedWindow(request)),
    )
    const writer = {
      writeRows: vi.fn(async (_bytes: Uint8Array, rowCount: number) => {
        writtenRows.push(rowCount)
      }),
      close: vi.fn(async () => new Blob([], { type: 'image/jpeg' })),
      abort: vi.fn(async () => undefined),
    }

    await runFullResolutionJpegExport({
      capability: makeCapability({
        width: 4,
        height: 4,
        rawWidth: 20,
        rawHeight: 30,
        visibleCrop: { x: 5, y: 7, width: 4, height: 4 },
      }),
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [
          { kind: 'input-linear-prophoto' },
          IDENTITY_RAW_RENDER_EXPOSURE_STEP,
          { kind: 'output-srgb' },
        ],
      },
      preferredRows: 2,
      readProcessedWindow,
      writerFactory: () => writer,
    })

    expect(readProcessedWindow.mock.calls.map(([request]) => request)).toEqual([
      {
        outputRect: { x: 0, y: 0, width: 4, height: 4 },
        halo: { left: 2, top: 2, right: 2, bottom: 2 },
      },
    ])
    expect(writtenRows).toEqual([4])
  })

  it('rejects processed windows whose rect does not match the requested output strip', async () => {
    const readProcessedWindow = vi.fn(
      (request: LumaRawProcessedWindowRequest) =>
        Promise.resolve(
          makeProcessedWindow({
            ...request,
            outputRect: { ...request.outputRect, y: request.outputRect.y + 1 },
          }),
        ),
    )
    const writer = {
      writeRows: vi.fn(),
      close: vi.fn(),
      abort: vi.fn(async () => undefined),
    }

    await expect(
      runFullResolutionJpegExport({
        capability: makeCapability(),
        graph: {
          supported: true,
          outputGamut: 'srgb-rec709',
          outputTransfer: 'srgb',
          lutProfile: null,
          steps: [
            { kind: 'input-linear-prophoto' },
            IDENTITY_RAW_RENDER_EXPOSURE_STEP,
            { kind: 'output-srgb' },
          ],
        },
        preferredRows: 2,
        readProcessedWindow,
        writerFactory: () => writer,
      }),
    ).rejects.toThrow('FULL_RES_EXPORT_INVALID_PROCESSED_WINDOW')

    expect(writer.writeRows).not.toHaveBeenCalled()
  })

  it('retries RESOURCE_ALLOCATION_FAILED with smaller strips and preserves JPEG dimensions', async () => {
    const writtenRows: Array<{ rowCount: number; bytes: Uint8Array }> = []
    let failedOnce = false
    const readProcessedWindow = vi.fn(
      (request: LumaRawProcessedWindowRequest) => {
        if (!failedOnce) {
          failedOnce = true
          return Promise.reject(new Error('RESOURCE_ALLOCATION_FAILED'))
        }

        return Promise.resolve(makeProcessedWindow(request))
      },
    )
    const writer = {
      writeRows: vi.fn(async (bytes: Uint8Array, rowCount: number) => {
        writtenRows.push({ rowCount, bytes: new Uint8Array(bytes) })
      }),
      close: vi.fn(
        async () =>
          new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
      ),
      abort: vi.fn(async () => undefined),
    }

    const blob = await runFullResolutionJpegExport({
      capability: makeCapability({
        height: 256,
        rawHeight: 256,
        visibleCrop: { x: 0, y: 0, width: 4, height: 256 },
      }),
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [
          { kind: 'input-linear-prophoto' },
          IDENTITY_RAW_RENDER_EXPOSURE_STEP,
          { kind: 'output-srgb' },
        ],
      },
      preferredRows: 256,
      readProcessedWindow,
      writerFactory: () => writer,
    })

    expect(blob.type).toBe('image/jpeg')
    expect(writer.abort).toHaveBeenCalledTimes(1)
    expect(readProcessedWindow).toHaveBeenCalledTimes(3)
    expect(
      readProcessedWindow.mock.calls.map(
        ([request]) => request.outputRect.height,
      ),
    ).toEqual([256, 128, 128])
    expect(writtenRows.map((entry) => entry.rowCount)).toEqual([128, 128])
    expect(
      writtenRows.reduce((total, entry) => total + entry.rowCount, 0),
    ).toBe(256)
    expect(
      writtenRows.map((entry) => entry.bytes.length / (entry.rowCount * 3)),
    ).toEqual([4, 4])
  })

  it('retries with a fresh writer after a resource failure following partial writes', async () => {
    const firstWriter = {
      writeRows: vi.fn(async () => undefined),
      close: vi.fn(),
      abort: vi.fn(async () => undefined),
    }
    const secondWriter = {
      writeRows: vi.fn(async () => undefined),
      close: vi.fn(
        async () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
      ),
      abort: vi.fn(async () => undefined),
    }
    const attemptWriters = [firstWriter, secondWriter]
    let callCount = 0
    const readProcessedWindow = vi.fn(
      (request: LumaRawProcessedWindowRequest) => {
        callCount += 1
        if (callCount === 2) {
          return Promise.reject(new Error('RESOURCE_ALLOCATION_FAILED'))
        }

        return Promise.resolve(makeProcessedWindow(request))
      },
    )

    const blob = await runFullResolutionJpegExport({
      capability: makeCapability({
        height: 512,
        rawHeight: 512,
        visibleCrop: { x: 0, y: 0, width: 4, height: 512 },
      }),
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [
          { kind: 'input-linear-prophoto' },
          IDENTITY_RAW_RENDER_EXPOSURE_STEP,
          { kind: 'output-srgb' },
        ],
      },
      preferredRows: 256,
      readProcessedWindow,
      writerFactory: () => {
        const writer = attemptWriters.shift()
        if (!writer) {
          throw new Error('unexpected writer request')
        }
        return writer
      },
    })

    expect(blob.type).toBe('image/jpeg')
    expect(attemptWriters).toHaveLength(0)
    expect(readProcessedWindow).toHaveBeenCalledTimes(6)
    expect(readProcessedWindow.mock.calls[0]?.[0].outputRect.height).toBe(256)
    expect(readProcessedWindow.mock.calls[2]?.[0].outputRect.height).toBe(128)
    expect(readProcessedWindow.mock.calls[5]?.[0].outputRect.height).toBe(128)
    expect(firstWriter.writeRows).toHaveBeenCalledTimes(1)
    expect(firstWriter.abort).toHaveBeenCalledTimes(1)
    expect(firstWriter.close).not.toHaveBeenCalled()
    expect(secondWriter.writeRows).toHaveBeenCalledTimes(4)
    expect(secondWriter.close).toHaveBeenCalledTimes(1)
    expect(secondWriter.abort).not.toHaveBeenCalled()
  })

  it('retries writer allocation failures and throws FULL_RES_EXPORT_RESOURCE_FAILURE after exhaustion', async () => {
    const readProcessedWindow = vi.fn()
    const writerFactory = vi.fn(() => {
      throw new Error('RESOURCE_ALLOCATION_FAILED')
    })

    await expect(
      runFullResolutionJpegExport({
        capability: makeCapability({
          height: 256,
          rawHeight: 256,
          visibleCrop: { x: 0, y: 0, width: 4, height: 256 },
        }),
        graph: {
          supported: true,
          outputGamut: 'srgb-rec709',
          outputTransfer: 'srgb',
          lutProfile: null,
          steps: [
            { kind: 'input-linear-prophoto' },
            IDENTITY_RAW_RENDER_EXPOSURE_STEP,
            { kind: 'output-srgb' },
          ],
        },
        preferredRows: 256,
        readProcessedWindow,
        writerFactory,
      }),
    ).rejects.toThrow('FULL_RES_EXPORT_RESOURCE_FAILURE')

    expect(writerFactory).toHaveBeenCalledTimes(3)
    expect(readProcessedWindow).not.toHaveBeenCalled()
  })

  it('surfaces a browser-build error when JPEG runtime initialization fails', async () => {
    const readProcessedWindow = vi.fn()

    await expect(
      runFullResolutionJpegExport({
        capability: makeCapability(),
        graph: {
          supported: true,
          outputGamut: 'srgb-rec709',
          outputTransfer: 'srgb',
          lutProfile: null,
          steps: [
            { kind: 'input-linear-prophoto' },
            IDENTITY_RAW_RENDER_EXPOSURE_STEP,
            { kind: 'output-srgb' },
          ],
        },
        readProcessedWindow,
        jpegSink: createWasmJpegRowSink(() => {
          throw new Error('JPEG_RUNTIME_UNAVAILABLE')
        }),
      }),
    ).rejects.toMatchObject({
      message:
        'Full-resolution JPEG export is not available in this browser build.',
    })

    expect(readProcessedWindow).not.toHaveBeenCalled()
  })

  it('retries wrapped JPEG encoder resource failures with smaller strips', async () => {
    const writtenRows: number[] = []
    let failedOnce = false
    let sessionCount = 0
    const jpegSink = createWasmJpegRowSink(() => ({
      createEncoder() {
        sessionCount += 1
        return {
          async writeRows(_bytes: Uint8Array, rowCount: number) {
            if (!failedOnce) {
              failedOnce = true
              throw new Error('RESOURCE_ALLOCATION_FAILED')
            }
            writtenRows.push(rowCount)
          },
          async finish() {
            return new Blob([new Uint8Array([1, 2, 3])], {
              type: 'image/jpeg',
            })
          },
          abort: vi.fn(),
        }
      },
      dispose: vi.fn(),
    }))

    const blob = await runFullResolutionJpegExport({
      capability: makeCapability({
        height: 256,
        rawHeight: 256,
        visibleCrop: { x: 0, y: 0, width: 4, height: 256 },
      }),
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [
          { kind: 'input-linear-prophoto' },
          IDENTITY_RAW_RENDER_EXPOSURE_STEP,
          { kind: 'output-srgb' },
        ],
      },
      preferredRows: 256,
      readProcessedWindow: vi.fn((request: LumaRawProcessedWindowRequest) =>
        Promise.resolve(makeProcessedWindow(request)),
      ),
      jpegSink,
    })

    expect(blob.type).toBe('image/jpeg')
    expect(sessionCount).toBe(2)
    expect(writtenRows).toEqual([128, 128])
  })

  it('throws FULL_RES_EXPORT_RESOURCE_FAILURE after exhausting strip retries', async () => {
    const writer = {
      writeRows: vi.fn(),
      close: vi.fn(),
      abort: vi.fn(async () => undefined),
    }
    const readProcessedWindow = vi.fn(() =>
      Promise.reject(new Error('RESOURCE_ALLOCATION_FAILED')),
    )

    await expect(
      runFullResolutionJpegExport({
        capability: makeCapability({
          height: 256,
          rawHeight: 256,
          visibleCrop: { x: 0, y: 0, width: 4, height: 256 },
        }),
        graph: {
          supported: true,
          outputGamut: 'srgb-rec709',
          outputTransfer: 'srgb',
          lutProfile: null,
          steps: [
            { kind: 'input-linear-prophoto' },
            IDENTITY_RAW_RENDER_EXPOSURE_STEP,
            { kind: 'output-srgb' },
          ],
        },
        preferredRows: 256,
        readProcessedWindow,
        writerFactory: () => writer,
      }),
    ).rejects.toThrow('FULL_RES_EXPORT_RESOURCE_FAILURE')

    expect(readProcessedWindow).toHaveBeenCalledTimes(3)
    expect(writer.writeRows).not.toHaveBeenCalled()
    expect(writer.abort).toHaveBeenCalledTimes(3)
  })

  it('uses the color graph before writing JPEG rows', async () => {
    const writtenRows: Array<{ rowCount: number; bytes: Uint8Array }> = []
    const readProcessedWindow = vi.fn(
      (request: LumaRawProcessedWindowRequest) =>
        Promise.resolve(makeProcessedWindow(request, 65535)),
    )
    const writer = {
      writeRows: vi.fn(async (bytes: Uint8Array, rowCount: number) => {
        writtenRows.push({ rowCount, bytes: new Uint8Array(bytes) })
      }),
      close: vi.fn(async () => new Blob([], { type: 'image/jpeg' })),
      abort: vi.fn(async () => undefined),
    }

    await runFullResolutionJpegExport({
      capability: makeCapability(),
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [
          { kind: 'input-linear-prophoto' },
          IDENTITY_RAW_RENDER_EXPOSURE_STEP,
          { kind: 'output-srgb' },
        ],
      },
      preferredRows: 2,
      readProcessedWindow,
      writerFactory: () => writer,
    })

    expect(writtenRows).toHaveLength(1)
    expect(writtenRows[0]?.rowCount).toBe(4)
    expect(writtenRows[0]?.bytes[0]).toBe(255)
  })

  it('matches scene-referred LUT domain, range, decode, and intensity semantics', async () => {
    const writtenRows: Array<{ rowCount: number; bytes: Uint8Array }> = []
    const legalScale = (940 - 64) / 1023
    const legalOffset = 64 / 1023
    const domainMin = 0.25
    const domainMax = 0.75
    const intensity = 0.25
    const lut = new Float32Array(2 * 2 * 2 * 3)

    for (let blue = 0; blue < 2; blue += 1) {
      for (let green = 0; green < 2; green += 1) {
        for (let red = 0; red < 2; red += 1) {
          const value = red
          const index = ((blue * 2 + green) * 2 + red) * 3
          lut[index] = value
          lut[index + 1] = value
          lut[index + 2] = value
        }
      }
    }

    const writer = {
      writeRows: vi.fn(async (bytes: Uint8Array, rowCount: number) => {
        writtenRows.push({ rowCount, bytes: new Uint8Array(bytes) })
      }),
      close: vi.fn(async () => new Blob([], { type: 'image/jpeg' })),
      abort: vi.fn(async () => undefined),
    }

    await runFullResolutionJpegExport({
      capability: makeCapability(),
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [
          { kind: 'input-linear-prophoto' },
          IDENTITY_RAW_RENDER_EXPOSURE_STEP,
          {
            kind: 'gamut-to-lut-input',
            matrix: mat3Identity(),
            gamut: 'prophoto-rgb',
          },
          {
            kind: 'encode-lut-transfer',
            transfer: 'gamma24',
            range: 'legal',
          },
          {
            kind: 'lut3d',
            size: 2,
            data: lut,
            domainMin: [domainMin, domainMin, domainMin],
            domainMax: [domainMax, domainMax, domainMax],
          },
          {
            kind: 'lut-output-to-srgb',
            matrix: mat3Identity(),
            transfer: 'gamma24',
            range: 'legal',
            role: 'scene-creative',
            intensity,
          },
          { kind: 'output-srgb' },
        ],
      },
      preferredRows: 2,
      readProcessedWindow: vi.fn((request: LumaRawProcessedWindowRequest) =>
        Promise.resolve(makeProcessedWindow(request, 32768)),
      ),
      writerFactory: () => writer,
    })

    const baseLinear = 32768 / 65535
    const lutInputEncoded =
      clamp01(Math.pow(baseLinear, 1 / 2.4)) * legalScale + legalOffset
    const normalized = clamp01(
      (lutInputEncoded - domainMin) / (domainMax - domainMin),
    )
    const lutOutputLinear = Math.max(
      Math.pow((normalized - legalOffset) / legalScale, 2.4),
      0,
    )
    const mixedLinear = baseLinear + (lutOutputLinear - baseLinear) * intensity
    const expectedByte = Math.round(clamp01(linearToSrgb(mixedLinear)) * 255)

    expect(writtenRows).toHaveLength(1)
    expect(writtenRows[0]?.bytes[0]).toBe(expectedByte)
    expect(writtenRows[0]?.bytes[0]).not.toBe(188)
  })

  it('aborts the writer if strip export fails after writer creation', async () => {
    const writer = {
      writeRows: vi.fn(),
      close: vi.fn(),
      abort: vi.fn(async () => undefined),
    }

    await expect(
      runFullResolutionJpegExport({
        capability: makeCapability(),
        graph: {
          supported: true,
          outputGamut: 'srgb-rec709',
          outputTransfer: 'srgb',
          lutProfile: null,
          steps: [
            { kind: 'input-linear-prophoto' },
            IDENTITY_RAW_RENDER_EXPOSURE_STEP,
            { kind: 'output-srgb' },
          ],
        },
        readProcessedWindow: vi
          .fn()
          .mockRejectedValue(new Error('read failed')),
        writerFactory: () => writer,
      }),
    ).rejects.toThrow('read failed')

    expect(writer.abort).toHaveBeenCalledTimes(1)
  })

  it('fails closed for malformed supported graphs instead of falling back to the simple path', async () => {
    const writer = {
      writeRows: vi.fn(),
      close: vi.fn(),
      abort: vi.fn(async () => undefined),
    }

    await expect(
      runFullResolutionJpegExport({
        capability: makeCapability(),
        graph: {
          supported: true,
          outputGamut: 'srgb-rec709',
          outputTransfer: 'srgb',
          lutProfile: null,
          steps: [
            { kind: 'input-linear-prophoto' },
            IDENTITY_RAW_RENDER_EXPOSURE_STEP,
            {
              kind: 'lut-output-to-srgb',
              matrix: mat3Identity(),
              transfer: 'srgb',
              range: 'full',
              role: 'scene-creative',
              intensity: 0.5,
            },
            { kind: 'output-srgb' },
          ],
        },
        readProcessedWindow: vi.fn(),
        writerFactory: () => writer,
      }),
    ).rejects.toThrow('FULL_RES_EXPORT_UNSUPPORTED_PIPELINE')

    expect(writer.writeRows).not.toHaveBeenCalled()
    expect(writer.abort).not.toHaveBeenCalled()
  })

  it('fails closed for malformed but complete supported graphs with duplicate steps', async () => {
    const writer = {
      writeRows: vi.fn(),
      close: vi.fn(),
      abort: vi.fn(async () => undefined),
    }

    await expect(
      runFullResolutionJpegExport({
        capability: makeCapability(),
        graph: {
          supported: true,
          outputGamut: 'srgb-rec709',
          outputTransfer: 'srgb',
          lutProfile: null,
          steps: [
            { kind: 'input-linear-prophoto' },
            IDENTITY_RAW_RENDER_EXPOSURE_STEP,
            {
              kind: 'gamut-to-lut-input',
              matrix: mat3Identity(),
              gamut: 'prophoto-rgb',
            },
            {
              kind: 'encode-lut-transfer',
              transfer: 'srgb',
              range: 'full',
            },
            {
              kind: 'encode-lut-transfer',
              transfer: 'srgb',
              range: 'full',
            },
            {
              kind: 'lut3d',
              size: 2,
              data: new Float32Array(24),
              domainMin: [0, 0, 0],
              domainMax: [1, 1, 1],
            },
            {
              kind: 'lut-output-to-srgb',
              matrix: mat3Identity(),
              transfer: 'srgb',
              range: 'full',
              role: 'scene-creative',
              intensity: 0.5,
            },
            { kind: 'output-srgb' },
          ],
        },
        readProcessedWindow: vi.fn(),
        writerFactory: () => writer,
      }),
    ).rejects.toThrow('FULL_RES_EXPORT_UNSUPPORTED_PIPELINE')

    expect(writer.writeRows).not.toHaveBeenCalled()
    expect(writer.abort).not.toHaveBeenCalled()
  })
})
