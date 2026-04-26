import type {
  LumaRawDecodeSession,
  LumaRawExportCapability,
  LumaRawWindow,
} from '@lumaforge/luma-raw-runtime'
import { describe, expect, it, vi } from 'vitest'

import {
  createRawExportSession,
  isRawExportSession,
} from './export-runtime-adapter'
import type { RawRuntimeSession } from './runtime-adapter'

function makeCapability(): LumaRawExportCapability {
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
  }
}

function makeWindow(): LumaRawWindow {
  return {
    rect: { x: 0, y: 0, width: 2, height: 2 },
    cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
    data: new Uint16Array([128, 128, 128, 128]),
    blackLevel: 0,
    whiteLevel: 255,
  }
}

describe('createRawExportSession', () => {
  it('forwards export capability and raw-window reads from the decode session', async () => {
    const capability = makeCapability()
    const window = makeWindow()
    const signal = new AbortController().signal
    const rect = { x: 1, y: 2, width: 3, height: 4 }
    const session = {
      probeExportCapability: vi.fn().mockResolvedValue(capability),
      readRawWindow: vi.fn().mockResolvedValue(window),
    } as unknown as LumaRawDecodeSession

    const exportSession = createRawExportSession(session)

    await expect(exportSession.probeExportCapability(signal)).resolves.toBe(
      capability,
    )
    await expect(exportSession.readRawWindow(rect, signal)).resolves.toBe(window)
    expect(session.probeExportCapability).toHaveBeenCalledWith(signal)
    expect(session.readRawWindow).toHaveBeenCalledWith(rect, signal)
  })
})

describe('isRawExportSession', () => {
  it('returns true when the session exposes export-stage functions', () => {
    const session = {
      extractEmbeddedPreview: vi.fn(),
      decodeQuickRaw: vi.fn(),
      decodeHqRaw: vi.fn(),
      dispose: vi.fn(),
      probeExportCapability: vi.fn(),
      readRawWindow: vi.fn(),
    } as unknown as RawRuntimeSession

    expect(isRawExportSession(session)).toBe(true)
  })

  it('returns false when export-stage functions are missing', () => {
    const session = {
      extractEmbeddedPreview: vi.fn(),
      decodeQuickRaw: vi.fn(),
      decodeHqRaw: vi.fn(),
      dispose: vi.fn(),
    } as RawRuntimeSession

    expect(isRawExportSession(session)).toBe(false)
  })
})
