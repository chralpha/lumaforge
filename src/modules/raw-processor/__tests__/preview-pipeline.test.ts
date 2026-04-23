import { describe, expect, it, vi } from 'vitest'

import { runPreviewPipeline } from '../services/preview-pipeline'

describe('runPreviewPipeline', () => {
  it('falls back to quick preview when embedded preview is unavailable', async () => {
    const onEvent = vi.fn()

    await runPreviewPipeline({
      file: new File(['raw'], 'frame.ARW'),
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickPreview: vi
        .fn()
        .mockResolvedValue({ width: 800, height: 600 }),
      decodeHqPreview: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
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
      file: new File(['raw'], 'frame.ARW'),
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickPreview: vi
        .fn()
        .mockResolvedValue({ width: 800, height: 600 }),
      decodeHqPreview: vi.fn().mockRejectedValue(new Error('decode failed')),
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

  it('still runs quick decode after an embedded preview is found', async () => {
    const onEvent = vi.fn()
    const decodeQuickPreview = vi
      .fn()
      .mockResolvedValue({ width: 800, height: 600 })

    await runPreviewPipeline({
      file: new File(['raw'], 'frame.ARW'),
      extractEmbeddedPreview: vi
        .fn()
        .mockResolvedValue({ width: 1600, height: 1067 }),
      decodeQuickPreview,
      decodeHqPreview: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
      onEvent,
    })

    expect(decodeQuickPreview).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'embedded-ready',
        width: 1600,
        height: 1067,
      }),
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
      file: new File(['raw'], 'frame.ARW'),
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickPreview: vi
        .fn()
        .mockResolvedValue({ width: 800, height: 600 }),
      decodeHqPreview: vi.fn().mockRejectedValue(error),
      onEvent,
    })

    expect(onEvent).toHaveBeenCalledWith({
      type: 'hq-failed',
      errorCode: 'RAW_CROSS_ORIGIN_ISOLATION_REQUIRED',
    })
  })
})
