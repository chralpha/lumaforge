import { describe, expect, it } from 'vitest'

import { LumaRawRuntimeError, normalizeRawRuntimeError } from './errors'
import type {
  LumaRawExportCapability,
  LumaRawFrame,
  LumaRawRuntimeInfo,
  LumaRawTimings,
  LumaRawWindow,
  LumaRawWindowRect,
} from './types'

describe('luma raw runtime public contract', () => {
  it('describes RGB16 Linear ProPhoto frames', () => {
    const timings: LumaRawTimings = {
      readFile: 3,
      openBuffer: 4,
      process: 12,
      transfer: 2,
      total: 21,
    }

    const frame: LumaRawFrame = {
      jobId: 'job-1',
      sessionId: 'session-1',
      source: 'quick',
      width: 2,
      height: 1,
      data: new Uint16Array([0, 32768, 65535, 1000, 2000, 3000]),
      layout: 'rgb',
      bitDepth: 16,
      colorSpace: 'linear-prophoto-rgb',
      orientation: 1,
      metadata: {
        width: 2,
        height: 1,
        supportLevel: 'experimental',
      },
      timings,
    }

    expect(frame.layout).toBe('rgb')
    expect(frame.bitDepth).toBe(16)
    expect(frame.colorSpace).toBe('linear-prophoto-rgb')
    expect(frame.data.byteLength).toBe(12)
  })

  it('normalizes stable runtime errors', () => {
    const error = new LumaRawRuntimeError(
      'RAW_CROSS_ORIGIN_ISOLATION_REQUIRED',
      'Cross-origin isolation is required for pthread RAW decode.',
    )
    const normalized = normalizeRawRuntimeError(
      error,
      'RAW_WORKER_PROTOCOL_ERROR',
    )
    const wrapped = normalizeRawRuntimeError(
      new Error('unexpected worker failure'),
      'RAW_WORKER_PROTOCOL_ERROR',
    )
    const fallback = normalizeRawRuntimeError(
      'unexpected string failure',
      'RAW_RUNTIME_UNAVAILABLE',
    )

    expect(normalized).toBe(error)
    expect(normalized.name).toBe('LumaRawRuntimeError')
    expect(normalized.code).toBe('RAW_CROSS_ORIGIN_ISOLATION_REQUIRED')
    expect(wrapped.name).toBe('LumaRawRuntimeError')
    expect(wrapped.code).toBe('RAW_WORKER_PROTOCOL_ERROR')
    expect(wrapped.message).toBe('unexpected worker failure')
    expect(fallback.name).toBe('LumaRawRuntimeError')
    expect(fallback.code).toBe('RAW_RUNTIME_UNAVAILABLE')
    expect(fallback.message).toBe('RAW runtime request failed.')
  })

  it('types raw-window export capability payloads', () => {
    const rect: LumaRawWindowRect = { x: 4, y: 6, width: 8, height: 10 }
    const supported: LumaRawExportCapability = {
      supported: true,
      width: 6000,
      height: 4000,
      rawWidth: 6048,
      rawHeight: 4024,
      cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
      blackLevel: 512,
      whiteLevel: 16383,
      orientation: 1,
      reasons: [],
    }
    const unsupported: LumaRawExportCapability = {
      supported: false,
      width: 0,
      height: 0,
      rawWidth: 0,
      rawHeight: 0,
      cfa: { pattern: 'unsupported', xPhase: 0, yPhase: 0 },
      blackLevel: 0,
      whiteLevel: 0,
      orientation: 1,
      reasons: ['unsupported-cfa'],
    }
    const rawWindow: LumaRawWindow = {
      rect,
      cfa: supported.cfa,
      data: new Uint16Array(rect.width * rect.height),
      blackLevel: supported.blackLevel,
      whiteLevel: supported.whiteLevel,
    }

    expect(supported.supported).toBe(true)
    expect(unsupported.supported).toBe(false)
    expect(rawWindow.data.length).toBe(80)
  })

  it('reports runtime capabilities without app dependencies', () => {
    const info: LumaRawRuntimeInfo = {
      runtime: 'luma',
      version: '0.1.0',
      simd: true,
      pthreads: true,
      crossOriginIsolated: true,
      memoryTier: 'normal',
      workerPoolSize: 2,
    }

    expect(info.runtime).toBe('luma')
    expect(info.pthreads).toBe(true)
  })
})
