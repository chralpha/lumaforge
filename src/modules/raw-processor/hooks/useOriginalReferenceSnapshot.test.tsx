import { renderHook, waitFor } from '@testing-library/react'

import type { DecodedImage } from '~/lib/raw/decoder'

import { useOriginalReferenceSnapshot } from './useOriginalReferenceSnapshot'

function createImage(
  source: 'quick' | 'bounded-hq',
  width = 1600,
): DecodedImage {
  return {
    width,
    height: 1000,
    channels: 3,
    bitsPerChannel: 16,
    data: new Uint16Array(width * 1000 * 3),
    layout: 'rgb-u16',
    colorSpace: 'linear-prophoto-rgb',
    source,
    metadata: { width, height: 1000 },
    renderExposure: { ev: 0, multiplier: 1, source: 'identity' },
  }
}

describe('useOriginalReferenceSnapshot', () => {
  it('creates a snapshot and keeps it stable across style-only rerenders', async () => {
    const renderSnapshot = vi.fn().mockResolvedValue({
      key: 'key-a',
      objectUrl: 'blob:a',
      width: 100,
      height: 50,
      source: 'quick',
      mimeType: 'image/jpeg',
      estimatedBytes: 10,
    })

    const image = createImage('quick')
    const { result, rerender } = renderHook(
      ({ styleVersion }) =>
        useOriginalReferenceSnapshot({
          sessionId: 'session-a',
          image,
          imageVersion: 1,
          displaySource: 'quick',
          capability: { webKitClass: 'chromium', pthread: true },
          styleVersion,
          renderSnapshot,
        }),
      { initialProps: { styleVersion: 1 } },
    )

    await waitFor(() =>
      expect(result.current.snapshot?.objectUrl).toBe('blob:a'),
    )
    rerender({ styleVersion: 2 })

    expect(renderSnapshot).toHaveBeenCalledTimes(1)
  })

  it('keeps the old snapshot visible until bounded HQ replacement is ready', async () => {
    let resolveSecond!: (value: unknown) => void
    const renderSnapshot = vi
      .fn()
      .mockResolvedValueOnce({
        key: 'quick-key',
        objectUrl: 'blob:quick',
        width: 100,
        height: 50,
        source: 'quick',
        mimeType: 'image/jpeg',
        estimatedBytes: 10,
      })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve
        }),
      )
    const releaseSnapshot = vi.fn()

    const { result, rerender } = renderHook(
      ({ image, displaySource, imageVersion }) =>
        useOriginalReferenceSnapshot({
          sessionId: 'session-a',
          image,
          imageVersion,
          displaySource,
          capability: { webKitClass: 'chromium', pthread: true },
          renderSnapshot,
          releaseSnapshot,
        }),
      {
        initialProps: {
          image: createImage('quick'),
          displaySource: 'quick' as const,
          imageVersion: 1,
        },
      },
    )

    await waitFor(() =>
      expect(result.current.snapshot?.objectUrl).toBe('blob:quick'),
    )

    rerender({
      image: createImage('bounded-hq', 2400),
      displaySource: 'bounded-hq',
      imageVersion: 2,
    })

    expect(result.current.snapshot?.objectUrl).toBe('blob:quick')
    resolveSecond({
      key: 'hq-key',
      objectUrl: 'blob:hq',
      width: 200,
      height: 100,
      source: 'bounded-hq',
      mimeType: 'image/jpeg',
      estimatedBytes: 20,
    })

    await waitFor(() =>
      expect(result.current.snapshot?.objectUrl).toBe('blob:hq'),
    )
    expect(releaseSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ objectUrl: 'blob:quick' }),
    )
  })

  it('replaces and releases the previous snapshot when the quick source changes', async () => {
    const releaseSnapshot = vi.fn()
    const renderSnapshot = vi
      .fn()
      .mockResolvedValueOnce({
        key: 'quick-key-a',
        objectUrl: 'blob:quick-a',
        width: 100,
        height: 50,
        source: 'quick',
        mimeType: 'image/jpeg',
        estimatedBytes: 10,
      })
      .mockResolvedValueOnce({
        key: 'quick-key-b',
        objectUrl: 'blob:quick-b',
        width: 120,
        height: 60,
        source: 'quick',
        mimeType: 'image/jpeg',
        estimatedBytes: 12,
      })

    const { result, rerender } = renderHook(
      ({ image, imageVersion }) =>
        useOriginalReferenceSnapshot({
          sessionId: 'session-a',
          image,
          imageVersion,
          displaySource: 'quick',
          capability: { webKitClass: 'chromium', pthread: true },
          renderSnapshot,
          releaseSnapshot,
        }),
      {
        initialProps: {
          image: createImage('quick'),
          imageVersion: 1,
        },
      },
    )

    await waitFor(() =>
      expect(result.current.snapshot?.objectUrl).toBe('blob:quick-a'),
    )

    rerender({
      image: createImage('quick', 1800),
      imageVersion: 2,
    })

    await waitFor(() =>
      expect(result.current.snapshot?.objectUrl).toBe('blob:quick-b'),
    )
    expect(releaseSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ objectUrl: 'blob:quick-a' }),
    )
  })

  it('releases and clears the snapshot when the source becomes ineligible', async () => {
    const releaseSnapshot = vi.fn()
    const renderSnapshot = vi.fn().mockResolvedValue({
      key: 'quick-key-a',
      objectUrl: 'blob:quick-a',
      width: 100,
      height: 50,
      source: 'quick',
      mimeType: 'image/jpeg',
      estimatedBytes: 10,
    })

    const { result, rerender } = renderHook(
      ({ image, displaySource }) =>
        useOriginalReferenceSnapshot({
          sessionId: 'session-a',
          image,
          imageVersion: 1,
          displaySource,
          capability: { webKitClass: 'chromium', pthread: true },
          renderSnapshot,
          releaseSnapshot,
        }),
      {
        initialProps: {
          image: createImage('quick') as DecodedImage | null,
          displaySource: 'quick' as const,
        },
      },
    )

    await waitFor(() =>
      expect(result.current.snapshot?.objectUrl).toBe('blob:quick-a'),
    )

    rerender({
      image: null,
      displaySource: 'none',
    })

    await waitFor(() => expect(result.current.snapshot).toBeNull())
    expect(releaseSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ objectUrl: 'blob:quick-a' }),
    )
  })

  it('releases and clears the snapshot when the session becomes unavailable', async () => {
    const releaseSnapshot = vi.fn()
    const renderSnapshot = vi.fn().mockResolvedValue({
      key: 'quick-key-a',
      objectUrl: 'blob:quick-a',
      width: 100,
      height: 50,
      source: 'quick',
      mimeType: 'image/jpeg',
      estimatedBytes: 10,
    })

    const { result, rerender } = renderHook(
      ({ sessionId }) =>
        useOriginalReferenceSnapshot({
          sessionId,
          image: createImage('quick'),
          imageVersion: 1,
          displaySource: 'quick',
          capability: { webKitClass: 'chromium', pthread: true },
          renderSnapshot,
          releaseSnapshot,
        }),
      {
        initialProps: {
          sessionId: 'session-a' as string | null,
        },
      },
    )

    await waitFor(() =>
      expect(result.current.snapshot?.objectUrl).toBe('blob:quick-a'),
    )

    rerender({ sessionId: null })

    await waitFor(() => expect(result.current.snapshot).toBeNull())
    expect(releaseSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ objectUrl: 'blob:quick-a' }),
    )
  })

  it('releases a cancelled replacement snapshot when it resolves late', async () => {
    let resolveReplacement!: (value: unknown) => void
    const releaseSnapshot = vi.fn()
    const renderSnapshot = vi
      .fn()
      .mockResolvedValueOnce({
        key: 'quick-key',
        objectUrl: 'blob:quick',
        width: 100,
        height: 50,
        source: 'quick',
        mimeType: 'image/jpeg',
        estimatedBytes: 10,
      })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveReplacement = resolve
        }),
      )

    const { result, rerender } = renderHook(
      ({ image, displaySource, imageVersion }) =>
        useOriginalReferenceSnapshot({
          sessionId: 'session-a',
          image,
          imageVersion,
          displaySource,
          capability: { webKitClass: 'chromium', pthread: true },
          renderSnapshot,
          releaseSnapshot,
        }),
      {
        initialProps: {
          image: createImage('quick') as DecodedImage | null,
          displaySource: 'quick' as const,
          imageVersion: 1,
        },
      },
    )

    await waitFor(() =>
      expect(result.current.snapshot?.objectUrl).toBe('blob:quick'),
    )

    rerender({
      image: createImage('bounded-hq', 2400),
      displaySource: 'bounded-hq',
      imageVersion: 2,
    })
    rerender({
      image: null,
      displaySource: 'none',
      imageVersion: 2,
    })

    await waitFor(() => expect(result.current.snapshot).toBeNull())

    resolveReplacement({
      key: 'hq-key',
      objectUrl: 'blob:hq',
      width: 200,
      height: 100,
      source: 'bounded-hq',
      mimeType: 'image/jpeg',
      estimatedBytes: 20,
    })

    await waitFor(() =>
      expect(releaseSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ objectUrl: 'blob:hq' }),
      ),
    )
    expect(result.current.snapshot).toBeNull()
  })

  it('reports fallback when generation fails', async () => {
    const { result } = renderHook(() =>
      useOriginalReferenceSnapshot({
        sessionId: 'session-a',
        image: createImage('quick'),
        imageVersion: 1,
        displaySource: 'quick',
        capability: { webKitClass: 'chromium', pthread: true },
        renderSnapshot: vi
          .fn()
          .mockRejectedValue(
            new Error('ORIGINAL_REFERENCE_SNAPSHOT_ENCODE_FAILED'),
          ),
      }),
    )

    await waitFor(() =>
      expect(result.current.fallbackReason).toBe(
        'ORIGINAL_REFERENCE_SNAPSHOT_ENCODE_FAILED',
      ),
    )
  })

  it('uses a generic fallback reason when generation fails without a message', async () => {
    const emptyMessageError = new Error('snapshot failed without a message')
    emptyMessageError.message = ''

    const { result } = renderHook(() =>
      useOriginalReferenceSnapshot({
        sessionId: 'session-a',
        image: createImage('quick'),
        imageVersion: 1,
        displaySource: 'quick',
        capability: { webKitClass: 'chromium', pthread: true },
        renderSnapshot: vi.fn().mockRejectedValue(emptyMessageError),
      }),
    )

    await waitFor(() =>
      expect(result.current.fallbackReason).toBe(
        'ORIGINAL_REFERENCE_SNAPSHOT_FAILED',
      ),
    )
  })

  it('uses an Error-like rejection message as the fallback reason', async () => {
    const { result } = renderHook(() =>
      useOriginalReferenceSnapshot({
        sessionId: 'session-a',
        image: createImage('quick'),
        imageVersion: 1,
        displaySource: 'quick',
        capability: { webKitClass: 'chromium', pthread: true },
        renderSnapshot: vi
          .fn()
          .mockRejectedValue({
            message: 'ORIGINAL_REFERENCE_SNAPSHOT_TIMEOUT',
          }),
      }),
    )

    await waitFor(() =>
      expect(result.current.fallbackReason).toBe(
        'ORIGINAL_REFERENCE_SNAPSHOT_TIMEOUT',
      ),
    )
  })

  it('releases the current snapshot on unmount', async () => {
    const releaseSnapshot = vi.fn()
    const renderSnapshot = vi.fn().mockResolvedValue({
      key: 'key-a',
      objectUrl: 'blob:a',
      width: 100,
      height: 50,
      source: 'quick',
      mimeType: 'image/jpeg',
      estimatedBytes: 10,
    })

    const { result, unmount } = renderHook(() =>
      useOriginalReferenceSnapshot({
        sessionId: 'session-a',
        image: createImage('quick'),
        imageVersion: 1,
        displaySource: 'quick',
        capability: { webKitClass: 'chromium', pthread: true },
        renderSnapshot,
        releaseSnapshot,
      }),
    )

    await waitFor(() =>
      expect(result.current.snapshot?.objectUrl).toBe('blob:a'),
    )

    unmount()

    expect(releaseSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ objectUrl: 'blob:a' }),
    )
  })
})
