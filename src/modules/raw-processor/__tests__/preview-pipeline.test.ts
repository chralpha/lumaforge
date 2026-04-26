import { describe, expect, it, vi } from 'vitest'

import type { PreviewEvent } from '../services/preview-pipeline'
import { runPreviewPipeline } from '../services/preview-pipeline'

describe('runPreviewPipeline', () => {
  it('falls back to quick preview when embedded preview is unavailable', async () => {
    const onEvent = vi.fn()

    await runPreviewPipeline({
      runtimeSession: {
        extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
        decodeQuickRaw: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
        decodeHqRaw: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
      },
      onEvent,
    })

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quick-ready', width: 800, height: 600 }),
    )
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'hq-ready', width: 4000, height: 3000 }),
    )
  })

  it('keeps the quick preview path observable when HQ decode fails', async () => {
    const onEvent = vi.fn()

    await runPreviewPipeline({
      runtimeSession: {
        extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
        decodeQuickRaw: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
        decodeHqRaw: vi.fn().mockRejectedValue(new Error('decode failed')),
      },
      onEvent,
    })

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quick-ready', width: 800, height: 600 }),
    )
    expect(onEvent).toHaveBeenCalledWith({
      type: 'hq-failed',
      errorCode: 'RAW_HQ_DECODE_FAILED',
    })
  })

  it('reports quick decode failure without marking quick or HQ preview ready', async () => {
    const onEvent = vi.fn()
    const decodeHqRaw = vi.fn()
    const error = Object.assign(new Error('quick decode failed'), {
      code: 'RAW_QUICK_DECODE_FAILED',
    })

    await runPreviewPipeline({
      runtimeSession: {
        extractEmbeddedPreview: vi.fn().mockResolvedValue({
          width: 1600,
          height: 1067,
          data: new Uint8Array([1, 2, 3]),
          mimeType: 'image/jpeg',
        }),
        decodeQuickRaw: vi.fn().mockRejectedValue(error),
        decodeHqRaw,
      },
      onEvent,
    })

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'embedded-ready' }),
    )
    expect(onEvent).toHaveBeenCalledWith({
      type: 'quick-failed',
      errorCode: 'RAW_QUICK_DECODE_FAILED',
      message: 'quick decode failed',
    })
    expect(onEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quick-ready' }),
    )
    expect(onEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'hq-ready' }),
    )
    expect(decodeHqRaw).not.toHaveBeenCalled()
  })

  it('still runs quick decode after an embedded preview is found', async () => {
    const onEvent = vi.fn()
    const decodeQuickRaw = vi
      .fn()
      .mockResolvedValue({ width: 800, height: 600 })
    const embeddedData = new Uint8Array([1, 2, 3])

    await runPreviewPipeline({
      runtimeSession: {
        extractEmbeddedPreview: vi.fn().mockResolvedValue({
          width: 1600,
          height: 1067,
          data: embeddedData,
          mimeType: 'image/jpeg',
          timings: { total: 8 },
        }),
        decodeQuickRaw,
        decodeHqRaw: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
      },
      onEvent,
    })

    expect(decodeQuickRaw).toHaveBeenCalledTimes(1)
    expect(onEvent.mock.calls[0][0]).toMatchObject({
      type: 'embedded-ready',
      width: 1600,
      height: 1067,
      data: embeddedData,
      mimeType: 'image/jpeg',
      timings: { total: 8 },
    })
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quick-ready', width: 800, height: 600 }),
    )
  })

  it('emits embedded preview bytes before quick and HQ decode events', async () => {
    const events: PreviewEvent[] = []
    const embeddedData = new Uint8Array([9, 8, 7])

    await runPreviewPipeline({
      runtimeSession: {
        extractEmbeddedPreview: vi.fn().mockResolvedValue({
          width: 1600,
          height: 1067,
          data: embeddedData,
          mimeType: 'image/jpeg',
          timings: { total: 12, thumbnail: 4 },
        }),
        decodeQuickRaw: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
        decodeHqRaw: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
      },
      onEvent: (event) => events.push(event),
    })

    expect(events.map((event) => event.type)).toEqual([
      'embedded-ready',
      'quick-ready',
      'hq-ready',
    ])
    expect(events[0]).toMatchObject({
      type: 'embedded-ready',
      width: 1600,
      height: 1067,
      data: embeddedData,
      mimeType: 'image/jpeg',
      timings: { total: 12, thumbnail: 4 },
    })
  })

  it('continues to quick decode when embedded preview extraction fails', async () => {
    const onEvent = vi.fn()
    const decodeQuickRaw = vi
      .fn()
      .mockResolvedValue({ width: 800, height: 600 })

    await runPreviewPipeline({
      runtimeSession: {
        extractEmbeddedPreview: vi
          .fn()
          .mockRejectedValue(new Error('thumbnail unavailable')),
        decodeQuickRaw,
        decodeHqRaw: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
      },
      onEvent,
    })

    expect(decodeQuickRaw).toHaveBeenCalledTimes(1)
    expect(onEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'embedded-ready' }),
    )
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quick-ready', width: 800, height: 600 }),
    )
  })

  it('preserves stable runtime error codes from HQ failures', async () => {
    const onEvent = vi.fn()
    const error = Object.assign(new Error('cross-origin isolation required'), {
      code: 'RAW_CROSS_ORIGIN_ISOLATION_REQUIRED',
    })

    await runPreviewPipeline({
      runtimeSession: {
        extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
        decodeQuickRaw: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
        decodeHqRaw: vi.fn().mockRejectedValue(error),
      },
      onEvent,
    })

    expect(onEvent).toHaveBeenCalledWith({
      type: 'hq-failed',
      errorCode: 'RAW_CROSS_ORIGIN_ISOLATION_REQUIRED',
    })
  })
})
