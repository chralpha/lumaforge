import type {
  LumaRawExportCapability,
  LumaRawWindow,
  LumaRawWindowRect,
} from '@lumaforge/luma-raw-runtime'
import { mat3Identity } from '~/lib/color/matrix'

import { runFullResolutionJpegExport } from './full-res-export'

function makeCapability(
  overrides: Partial<LumaRawExportCapability> = {},
): LumaRawExportCapability {
  return {
    supported: true,
    width: 4,
    height: 4,
    rawWidth: 4,
    rawHeight: 4,
    cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
    blackLevel: 0,
    whiteLevel: 255,
    orientation: 1,
    reasons: [],
    ...overrides,
  }
}

function makeWindow(rect: LumaRawWindowRect): LumaRawWindow {
  return {
    rect,
    cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
    data: new Uint16Array(rect.width * rect.height).fill(128),
    blackLevel: 0,
    whiteLevel: 255,
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

describe('runFullResolutionJpegExport', () => {
  it('throws FULL_RES_EXPORT_UNSUPPORTED_SOURCE before opening writer or reading windows', async () => {
    const readRawWindow = vi.fn()
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
          steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
        },
        readRawWindow,
        jpegSink,
      }),
    ).rejects.toThrow('FULL_RES_EXPORT_UNSUPPORTED_SOURCE')

    expect(readRawWindow).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })

  it('reports strip progress and returns the JPEG blob', async () => {
    const progress: number[] = []
    const writtenRows: Array<{ rowCount: number; bytes: Uint8Array }> = []
    const readRawWindow = vi.fn((rect: LumaRawWindowRect) =>
      Promise.resolve(makeWindow(rect)),
    )
    const writer = {
      writeRows: vi.fn(async (bytes: Uint8Array, rowCount: number) => {
        writtenRows.push({ rowCount, bytes: new Uint8Array(bytes) })
      }),
      close: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })),
      abort: vi.fn(async () => undefined),
    }

    const blob = await runFullResolutionJpegExport({
      capability: makeCapability(),
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
      },
      preferredRows: 2,
      readRawWindow,
      writer,
      onProgress(entry) {
        progress.push(entry.progress)
      },
    })

    expect(blob.type).toBe('image/jpeg')
    expect(readRawWindow).toHaveBeenCalledTimes(2)
    expect(writtenRows).toHaveLength(2)
    expect(writtenRows[0]?.rowCount).toBe(2)
    expect(writtenRows[1]?.rowCount).toBe(2)
    expect(writtenRows[0]?.bytes).toEqual(new Uint8Array(4 * 2 * 3).fill(188))
    expect(writtenRows[1]?.bytes).toEqual(new Uint8Array(4 * 2 * 3).fill(188))
    expect(progress.at(-1)).toBe(100)
  })

  it('retries RESOURCE_ALLOCATION_FAILED with smaller strips and preserves JPEG dimensions', async () => {
    const writtenRows: Array<{ rowCount: number; bytes: Uint8Array }> = []
    let failedOnce = false
    const readRawWindow = vi.fn((rect: LumaRawWindowRect) => {
      if (!failedOnce) {
        failedOnce = true
        return Promise.reject(new Error('RESOURCE_ALLOCATION_FAILED'))
      }

      return Promise.resolve(makeWindow(rect))
    })
    const writer = {
      writeRows: vi.fn(async (bytes: Uint8Array, rowCount: number) => {
        writtenRows.push({ rowCount, bytes: new Uint8Array(bytes) })
      }),
      close: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })),
      abort: vi.fn(async () => undefined),
    }

    const blob = await runFullResolutionJpegExport({
      capability: makeCapability({ height: 256, rawHeight: 256 }),
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
      },
      preferredRows: 256,
      readRawWindow,
      writer,
    })

    expect(blob.type).toBe('image/jpeg')
    expect(writer.abort).toHaveBeenCalledTimes(1)
    expect(readRawWindow).toHaveBeenCalledTimes(3)
    expect(readRawWindow.mock.calls.map(([rect]) => rect.height)).toEqual([
      256, 130, 130,
    ])
    expect(writtenRows.map((entry) => entry.rowCount)).toEqual([128, 128])
    expect(
      writtenRows.reduce((total, entry) => total + entry.rowCount, 0),
    ).toBe(256)
    expect(
      writtenRows.map((entry) => entry.bytes.length / (entry.rowCount * 3)),
    ).toEqual([4, 4])
  })

  it('throws FULL_RES_EXPORT_RESOURCE_FAILURE after exhausting strip retries', async () => {
    const writer = {
      writeRows: vi.fn(),
      close: vi.fn(),
      abort: vi.fn(async () => undefined),
    }
    const readRawWindow = vi.fn(() =>
      Promise.reject(new Error('RESOURCE_ALLOCATION_FAILED')),
    )

    await expect(
      runFullResolutionJpegExport({
        capability: makeCapability({ height: 256, rawHeight: 256 }),
        graph: {
          supported: true,
          outputGamut: 'srgb-rec709',
          outputTransfer: 'srgb',
          lutProfile: null,
          steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
        },
        preferredRows: 256,
        readRawWindow,
        writer,
      }),
    ).rejects.toThrow('FULL_RES_EXPORT_RESOURCE_FAILURE')

    expect(readRawWindow).toHaveBeenCalledTimes(3)
    expect(writer.writeRows).not.toHaveBeenCalled()
    expect(writer.abort).toHaveBeenCalledTimes(3)
  })

  it('uses the color graph before writing JPEG rows', async () => {
    const writtenRows: Array<{ rowCount: number; bytes: Uint8Array }> = []
    const readRawWindow = vi.fn((rect: LumaRawWindowRect) =>
      Promise.resolve({
        rect,
        cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
        data: new Uint16Array(rect.width * rect.height).fill(255),
        blackLevel: 0,
        whiteLevel: 255,
      }),
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
        steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
      },
      preferredRows: 2,
      readRawWindow,
      writer,
    })

    expect(writtenRows).toHaveLength(2)
    expect(writtenRows[0]?.rowCount).toBe(2)
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
      readRawWindow: vi.fn((rect: LumaRawWindowRect) =>
        Promise.resolve({
          rect,
          cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
          data: new Uint16Array(rect.width * rect.height).fill(128),
          blackLevel: 0,
          whiteLevel: 255,
        }),
      ),
      writer,
    })

    const baseLinear = 128 / 255
    const lutInputEncoded =
      clamp01(Math.pow(baseLinear, 1 / 2.4)) * legalScale + legalOffset
    const normalized = clamp01((lutInputEncoded - domainMin) / (domainMax - domainMin))
    const lutOutputLinear = Math.max(
      Math.pow((normalized - legalOffset) / legalScale, 2.4),
      0,
    )
    const mixedLinear =
      baseLinear + (lutOutputLinear - baseLinear) * intensity
    const expectedByte = Math.round(clamp01(linearToSrgb(mixedLinear)) * 255)

    expect(writtenRows).toHaveLength(2)
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
          steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
        },
        readRawWindow: vi.fn().mockRejectedValue(new Error('read failed')),
        writer,
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
        readRawWindow: vi.fn(),
        writer,
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
        readRawWindow: vi.fn(),
        writer,
      }),
    ).rejects.toThrow('FULL_RES_EXPORT_UNSUPPORTED_PIPELINE')

    expect(writer.writeRows).not.toHaveBeenCalled()
    expect(writer.abort).not.toHaveBeenCalled()
  })
})
