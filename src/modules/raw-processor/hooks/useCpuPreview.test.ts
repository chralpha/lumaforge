import type { RawRenderExposure } from '@lumaforge/luma-color-runtime'
import { exposureMultiplierFromEv } from '@lumaforge/luma-color-runtime'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  CpuPreviewRequest,
  CpuPreviewResponse,
} from '~/lib/preview/cpu-preview-protocol'
import type { DecodedImage } from '~/lib/raw/decoder'

import type { CpuPreviewParams } from './useCpuPreview'
import {
  buildCpuPreviewGraph,
  neutralFrameCacheKey,
  useCpuPreview,
} from './useCpuPreview'

const exposure: RawRenderExposure = {
  ev: 0.5,
  multiplier: exposureMultiplierFromEv(0.5),
  source: 'user',
}

// Non-trivial look + tone so the neutral path must zero ALL of it.
const baseParams: CpuPreviewParams = {
  styleKind: 'custom',
  intensity: 0.8,
  builtinPreset: null,
  lut: null,
  rawRenderExposure: exposure,
  userExposureEv: 0.7,
  userContrast: 20,
  userHighlights: -15,
  userShadows: 10,
  userWhites: 5,
  userBlacks: -5,
}

class FakeWorker {
  static instances: FakeWorker[] = []

  onmessage: ((event: { data: CpuPreviewResponse }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  readonly posted: CpuPreviewRequest[] = []
  readonly terminate = vi.fn()

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(message: CpuPreviewRequest) {
    this.posted.push(message)
  }

  respond(response: CpuPreviewResponse) {
    this.onmessage?.({ data: response })
  }
}

function makeDecodedImage(
  source: 'quick' | 'bounded-hq',
  over: Partial<DecodedImage> = {},
): DecodedImage {
  return {
    width: 2,
    height: 2,
    channels: 3,
    bitsPerChannel: 16,
    data: new Uint16Array(12),
    layout: 'rgb-u16',
    colorSpace: 'linear-prophoto-rgb',
    source,
    metadata: { width: 2, height: 2 },
    renderExposure: exposure,
    ...over,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  FakeWorker.instances = []
})

describe('useCpuPreview helpers', () => {
  it('neutral cache key changes only with source + render exposure', () => {
    expect(neutralFrameCacheKey('s1', 0.5)).toBe(
      neutralFrameCacheKey('s1', 0.5),
    )
    expect(neutralFrameCacheKey('s1', 0.5)).not.toBe(
      neutralFrameCacheKey('s1', 1.0),
    )
    expect(neutralFrameCacheKey('s1', 0.5)).not.toBe(
      neutralFrameCacheKey('s2', 0.5),
    )
  })

  it('neutral zeros ALL look + tone but keeps render exposure', () => {
    const neutral = buildCpuPreviewGraph(baseParams, 'neutral')
    expect('unsupportedReason' in neutral).toBe(false)
    // Equivalent to a fully-zeroed-edits processed graph with the same exposure.
    const zeroed = buildCpuPreviewGraph(
      {
        styleKind: 'none',
        intensity: 0,
        builtinPreset: null,
        lut: null,
        rawRenderExposure: exposure,
        userExposureEv: 0,
        userContrast: 0,
        userHighlights: 0,
        userShadows: 0,
        userWhites: 0,
        userBlacks: 0,
      },
      'processed',
    )
    expect(neutral).toEqual(zeroed)
  })

  it('processed honors the look + tone params', () => {
    const processed = buildCpuPreviewGraph(baseParams, 'processed')
    expect('unsupportedReason' in processed).toBe(false)
    // Differs from neutral because edits are applied.
    expect(processed).not.toEqual(buildCpuPreviewGraph(baseParams, 'neutral'))
  })
})

describe('useCpuPreview hook', () => {
  it('keeps the quick CPU source but uses the current decoded image exposure after bounded-HQ replaces it', () => {
    vi.stubGlobal('Worker', FakeWorker)
    const quickImage = makeDecodedImage('quick')
    const boundedHqExposure: RawRenderExposure = {
      ev: 2,
      multiplier: exposureMultiplierFromEv(2),
      source: 'image-statistics',
    }
    const boundedHqImage = makeDecodedImage('bounded-hq', {
      width: 4,
      height: 4,
      data: new Uint16Array(4 * 4 * 3),
      renderExposure: boundedHqExposure,
    })

    const { result, rerender } = renderHook((props) => useCpuPreview(props), {
      initialProps: {
        enabled: true,
        image: quickImage,
        imageVersion: 1,
        params: baseParams,
        variant: 'processed' as const,
      },
    })

    const worker = FakeWorker.instances[0]
    expect(worker).toBeDefined()
    expect(result.current.inFlight).toBe(true)
    const firstRender = worker.posted.find((m) => m.type === 'render')
    expect(firstRender).toBeDefined()

    act(() => {
      worker.respond({
        type: 'rendered',
        sourceId: firstRender!.sourceId,
        requestId: firstRender!.requestId,
        rgba: new Uint8ClampedArray(2 * 2 * 4),
        width: 2,
        height: 2,
      })
    })

    expect(result.current.frame?.sourceId).toBe(firstRender!.sourceId)

    const renderCountBeforeHqReplace = worker.posted.filter(
      (m) => m.type === 'render',
    ).length

    rerender({
      enabled: true,
      image: boundedHqImage,
      imageVersion: 2,
      params: { ...baseParams, rawRenderExposure: boundedHqExposure },
      variant: 'processed' as const,
    })

    expect(result.current.frame?.sourceId).toBe(firstRender!.sourceId)

    const rendersAfterHqReplace = worker.posted.filter(
      (m) => m.type === 'render',
    )
    expect(rendersAfterHqReplace).toHaveLength(renderCountBeforeHqReplace + 1)
    const hqExposureRender = rendersAfterHqReplace.at(-1)
    expect(hqExposureRender?.sourceId).toBe(firstRender!.sourceId)
    expect(hqExposureRender?.graph.steps[1]).toMatchObject({
      kind: 'raw-render-exposure',
      ev: boundedHqExposure.ev,
      multiplier: boundedHqExposure.multiplier,
    })

    act(() => {
      worker.respond({
        type: 'rendered',
        sourceId: hqExposureRender!.sourceId,
        requestId: hqExposureRender!.requestId,
        rgba: new Uint8ClampedArray(2 * 2 * 4),
        width: 2,
        height: 2,
      })
    })

    const renderCountBeforeToneChange = worker.posted.filter(
      (m) => m.type === 'render',
    ).length

    rerender({
      enabled: true,
      image: boundedHqImage,
      imageVersion: 2,
      params: {
        ...baseParams,
        rawRenderExposure: boundedHqExposure,
        userContrast: 30,
      },
      variant: 'processed' as const,
    })

    const rendersAfterToneChange = worker.posted.filter(
      (m) => m.type === 'render',
    )
    expect(rendersAfterToneChange).toHaveLength(renderCountBeforeToneChange + 1)
    const latestRender = rendersAfterToneChange.at(-1)
    expect(latestRender?.sourceId).toBe(firstRender!.sourceId)
    expect(latestRender?.graph.steps[1]).toMatchObject({
      kind: 'raw-render-exposure',
      ev: boundedHqExposure.ev,
      multiplier: boundedHqExposure.multiplier,
    })
  })
})
