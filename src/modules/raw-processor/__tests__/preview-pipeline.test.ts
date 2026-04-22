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
})
