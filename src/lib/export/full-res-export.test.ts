import type {
  LumaRawExportCapability,
  LumaRawWindow,
  LumaRawWindowRect,
} from '@lumaforge/luma-raw-runtime'

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
    expect(writtenRows[0]?.bytes).toEqual(new Uint8Array(4 * 2 * 3).fill(128))
    expect(writtenRows[1]?.bytes).toEqual(new Uint8Array(4 * 2 * 3).fill(128))
    expect(progress.at(-1)).toBe(100)
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
})
