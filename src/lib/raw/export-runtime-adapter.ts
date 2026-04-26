import type {
  LumaRawDecodeSession,
  LumaRawExportCapability,
  LumaRawWindow,
  LumaRawWindowRect,
} from '@lumaforge/luma-raw-runtime'

import type { RawRuntimeSession } from './runtime-adapter'

export type RawExportSession = {
  probeExportCapability: (
    signal?: AbortSignal,
  ) => Promise<LumaRawExportCapability>
  readRawWindow: (
    rect: LumaRawWindowRect,
    signal?: AbortSignal,
  ) => Promise<LumaRawWindow>
}

export function createRawExportSession(
  session: LumaRawDecodeSession,
): RawExportSession {
  return {
    probeExportCapability(signal) {
      return session.probeExportCapability(signal)
    },
    readRawWindow(rect, signal) {
      return session.readRawWindow(rect, signal)
    },
  }
}

export function isRawExportSession(
  value: unknown,
): value is RawRuntimeSession & RawExportSession {
  if (!value || typeof value !== 'object') {
    return false
  }

  return (
    typeof (value as Partial<RawExportSession>).probeExportCapability ===
      'function' &&
    typeof (value as Partial<RawExportSession>).readRawWindow === 'function'
  )
}
