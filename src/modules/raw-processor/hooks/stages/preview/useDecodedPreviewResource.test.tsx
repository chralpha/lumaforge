import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createResourceRegistry } from '~/lib/export/resource-registry'
import type { DecodedImage } from '~/lib/raw/decoder'

import { useDecodedPreviewResource } from './useDecodedPreviewResource'

function createDecodedImage(
  ev: number,
  data = new Float32Array(4),
): DecodedImage {
  return {
    width: 1,
    height: 1,
    channels: 4,
    bitsPerChannel: 32,
    data,
    layout: 'rgba-float32',
    colorSpace: 'linear-prophoto-rgb',
    source: 'bounded-hq',
    metadata: { width: 1, height: 1 },
    renderExposure: {
      ev,
      multiplier: 2 ** ev,
      source: 'identity',
    },
  }
}

describe('useDecodedPreviewResource', () => {
  it('registers decoded previews and clears the active ref when the resource is disposed', async () => {
    const registry = createResourceRegistry()
    const decodedImageRef = { current: null as DecodedImage | null }
    const rawRenderExposureRef = {
      current: null as DecodedImage['renderExposure'] | null,
    }
    let version = 0

    const { result } = renderHook(() =>
      useDecodedPreviewResource({
        decodedImageRef,
        rawRenderExposureRef,
        resourceRegistryRef: { current: registry },
        setDecodedImageVersion: (updater) => {
          version = typeof updater === 'function' ? updater(version) : updater
        },
        invalidateExportGraph: vi.fn(),
      }),
    )

    const decoded = createDecodedImage(0)
    result.current.setDecodedImageRef(decoded)

    expect(decodedImageRef.current).toBe(decoded)
    expect(version).toBe(1)
    expect(registry.snapshot().live).toEqual([
      {
        id: 'decoded-preview-1',
        owner: 'preview',
        kind: 'array-buffer',
        estimatedBytes: decoded.data.byteLength,
      },
    ])

    await registry.disposeOwners(['preview'])

    expect(decodedImageRef.current).toBeNull()
    expect(version).toBe(2)
  })

  it('invalidates the export graph when decoded preview exposure changes unless preserving export result', () => {
    const registry = createResourceRegistry()
    const decodedImageRef = { current: null as DecodedImage | null }
    const rawRenderExposureRef = {
      current: null as DecodedImage['renderExposure'] | null,
    }
    const invalidateExportGraph = vi.fn()

    const { result } = renderHook(() =>
      useDecodedPreviewResource({
        decodedImageRef,
        rawRenderExposureRef,
        resourceRegistryRef: { current: registry },
        setDecodedImageVersion: vi.fn(),
        invalidateExportGraph,
      }),
    )

    result.current.setDecodedImageRef(createDecodedImage(0))
    result.current.setDecodedImageRef(createDecodedImage(1), {
      preserveExportResult: true,
    })
    result.current.setDecodedImageRef(createDecodedImage(2))

    expect(invalidateExportGraph).toHaveBeenCalledTimes(2)
  })
})
