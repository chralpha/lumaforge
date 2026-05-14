import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DecodedImage } from '~/lib/raw/decoder'

import { DEFAULT_PREVIEW_VIEWPORT } from '../services/preview-viewport'
import {
  createRawUploadInput,
  syncRawUploadInput,
} from './preview-canvas-helpers'
import { PreviewCanvas } from './PreviewCanvas'

const pipelineMock = vi.hoisted(() => ({
  instances: [] as Array<{
    initialize: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    disposeMock: ReturnType<typeof vi.fn>
    resize: ReturnType<typeof vi.fn>
    render: ReturnType<typeof vi.fn>
    clearImage: ReturnType<typeof vi.fn>
    uploadImage: ReturnType<typeof vi.fn>
    clearLUT: ReturnType<typeof vi.fn>
    uploadLUT: ReturnType<typeof vi.fn>
    setParams: ReturnType<typeof vi.fn>
  }>,
  initialize: vi.fn(),
}))

vi.mock('~/lib/gl/pipeline', () => ({
  RawProcessingPipeline: vi.fn().mockImplementation(() => {
    const disposeMock = vi.fn()
    const instance = {
      initialize: pipelineMock.initialize,
      dispose: disposeMock,
      disposeMock,
      resize: vi.fn(),
      render: vi.fn(() => ({ renderMs: 1 })),
      clearImage: vi.fn(),
      uploadImage: vi.fn(),
      clearLUT: vi.fn(),
      uploadLUT: vi.fn(),
      setParams: vi.fn(),
    }

    pipelineMock.instances.push(instance)
    return instance
  }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return { promise, resolve, reject }
}

const defaultParams: ProcessingParams = {
  userExposureEv: 0,
  userContrast: 0,
  userHighlights: 0,
  userShadows: 0,
  userWhites: 0,
  userBlacks: 0,
  intensity: 0.7,
  viewMode: 'processed',
  compareSplit: 0.5,
  styleKind: 'none',
  builtinPreset: null,
}

const decodedImage: DecodedImage = {
  width: 400,
  height: 300,
  channels: 4,
  bitsPerChannel: 32,
  data: new Float32Array(400 * 300 * 4),
  layout: 'rgba-float32',
  colorSpace: 'display-srgb-preview',
  metadata: {
    width: 400,
    height: 300,
  },
  renderExposure: { ev: 0, multiplier: 1, source: 'identity' },
}

function elementRect({
  left = 0,
  top = 0,
  width,
  height,
}: {
  left?: number
  top?: number
  width: number
  height: number
}): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function setElementRect(
  element: HTMLElement,
  rect: Parameters<typeof elementRect>[0],
) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(elementRect(rect))
}

function renderInteractivePreview({
  previewViewport = DEFAULT_PREVIEW_VIEWPORT,
  onPreviewViewportChange = vi.fn(),
}: {
  previewViewport?: typeof DEFAULT_PREVIEW_VIEWPORT
  onPreviewViewportChange?: ReturnType<typeof vi.fn>
} = {}) {
  const result = render(
    createElement(PreviewCanvas, {
      imageRef: { current: decodedImage },
      imageVersion: 1,
      params: defaultParams,
      lutDataRef: { current: null },
      lutDataVersion: 0,
      previewViewport,
      onPreviewViewportChange,
    }),
  )
  const frame = result.container.querySelector<HTMLElement>(
    '[data-raw-preview-frame]',
  )
  const surface = result.container.querySelector<HTMLElement>(
    '[data-raw-preview-surface]',
  )
  const track = result.container.querySelector<HTMLElement>(
    '[data-raw-compare-track="image"]',
  )

  if (frame) setElementRect(frame, { width: 400, height: 300 })
  if (track) setElementRect(track, { width: 400, height: 300 })
  if (surface) setElementRect(surface, { width: 400, height: 300 })

  return {
    ...result,
    frame,
    track,
    surface,
    onPreviewViewportChange,
  }
}

describe('preview canvas upload descriptor', () => {
  beforeEach(() => {
    pipelineMock.instances.length = 0
    pipelineMock.initialize.mockReset()
    pipelineMock.initialize.mockResolvedValue(undefined)
    window.PointerEvent = MouseEvent as typeof PointerEvent
    HTMLElement.prototype.setPointerCapture = vi.fn()
    HTMLElement.prototype.releasePointerCapture = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn().mockImplementation(() => ({
        observe: vi.fn(),
        disconnect: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts legacy Float32 RGBA display-sRGB input', () => {
    const data = new Float32Array(4)

    expect(
      createRawUploadInput({
        data,
        layout: 'rgba-float32',
        colorSpace: 'display-srgb-preview',
        width: 1,
        height: 1,
      }),
    ).toEqual({
      data,
      layout: 'rgba-float32',
      colorSpace: 'display-srgb-preview',
      width: 1,
      height: 1,
    })
  })

  it('accepts RGB16 Linear ProPhoto input', () => {
    const data = new Uint16Array(3)

    expect(
      createRawUploadInput({
        data,
        layout: 'rgb-u16',
        colorSpace: 'linear-prophoto-rgb',
        width: 1,
        height: 1,
        renderExposureEv: 0,
      }),
    ).toEqual({
      data,
      layout: 'rgb-u16',
      colorSpace: 'linear-prophoto-rgb',
      width: 1,
      height: 1,
      renderExposureEv: 0,
      renderExposureMultiplier: 1,
    })
  })

  it('passes decoded raw render exposure into WebGL upload input', () => {
    const data = new Uint16Array([1024, 1024, 1024])
    expect(
      createRawUploadInput({
        data,
        layout: 'rgb-u16',
        colorSpace: 'linear-prophoto-rgb',
        width: 1,
        height: 1,
        renderExposureEv: 1.5,
      }),
    ).toMatchObject({
      renderExposureEv: 1.5,
      renderExposureMultiplier: Math.pow(2, 1.5),
    })
  })

  it('rejects mismatched data, layout, and color space combinations', () => {
    expect(
      createRawUploadInput({
        data: new Uint16Array(3),
        layout: 'rgba-float32',
        colorSpace: 'display-srgb-preview',
        width: 1,
        height: 1,
      }),
    ).toBeNull()
    expect(
      createRawUploadInput({
        data: new Float32Array(4),
        layout: 'rgb-u16',
        colorSpace: 'linear-prophoto-rgb',
        width: 1,
        height: 1,
        renderExposureEv: 0,
      }),
    ).toBeNull()
    expect(
      createRawUploadInput({
        data: new Uint16Array(3),
        layout: 'rgb-u16',
        colorSpace: 'display-srgb-preview',
        width: 1,
        height: 1,
      }),
    ).toBeNull()
  })

  it('clears stale pipeline input when data is missing', () => {
    const pipeline = {
      clearImage: vi.fn(),
      uploadImage: vi.fn(),
    }
    const setError = vi.fn()

    expect(
      syncRawUploadInput({
        pipeline,
        imageData: null,
        uploadInput: null,
        setError,
      }),
    ).toBe(false)
    expect(pipeline.clearImage).toHaveBeenCalledTimes(1)
    expect(pipeline.uploadImage).not.toHaveBeenCalled()
    expect(setError).toHaveBeenCalledWith(null)
  })

  it('clears stale pipeline input when descriptor validation fails', () => {
    const pipeline = {
      clearImage: vi.fn(),
      uploadImage: vi.fn(),
    }
    const setError = vi.fn()

    expect(
      syncRawUploadInput({
        pipeline,
        imageData: new Uint16Array(3),
        uploadInput: null,
        setError,
      }),
    ).toBe(false)
    expect(pipeline.clearImage).toHaveBeenCalledTimes(1)
    expect(pipeline.uploadImage).not.toHaveBeenCalled()
    expect(setError).toHaveBeenCalledWith(
      'Decoded image data does not match the WebGL upload layout',
    )
  })

  it('uploads valid descriptors without clearing the pipeline', () => {
    const pipeline = {
      clearImage: vi.fn(),
      uploadImage: vi.fn(),
    }
    const setError = vi.fn()
    const uploadInput = {
      data: new Float32Array(4),
      layout: 'rgba-float32',
      colorSpace: 'display-srgb-preview',
      width: 1,
      height: 1,
    } as const

    expect(
      syncRawUploadInput({
        pipeline,
        imageData: uploadInput.data,
        uploadInput,
        setError,
      }),
    ).toBe(true)
    expect(pipeline.clearImage).not.toHaveBeenCalled()
    expect(pipeline.uploadImage).toHaveBeenCalledWith(uploadInput)
    expect(setError).toHaveBeenCalledWith(null)
  })

  it('describes preview initialization failures without exposing a WebGL error panel', async () => {
    pipelineMock.initialize.mockRejectedValueOnce(
      new Error('Context restore failed'),
    )

    render(
      createElement(PreviewCanvas, {
        imageRef: { current: null },
        imageVersion: 0,
        params: defaultParams,
        lutDataRef: { current: null },
        lutDataVersion: 0,
      }),
    )

    await waitFor(() => {
      expect(screen.getByText('Preview unavailable')).toBeTruthy()
    })
    expect(screen.queryByText('WebGL Error')).toBeNull()
    expect(screen.getByText('Context restore failed')).toBeTruthy()
  })

  it('uploads decoded image render exposure through the component path', async () => {
    const data = new Uint16Array([1024, 1024, 1024])
    const image: DecodedImage = {
      data,
      width: 1,
      height: 1,
      channels: 3,
      bitsPerChannel: 16,
      layout: 'rgb-u16',
      colorSpace: 'linear-prophoto-rgb',
      metadata: {
        width: 1,
        height: 1,
      },
      renderExposure: {
        ev: 1.25,
        multiplier: Math.pow(2, 1.25),
        source: 'image-statistics',
      },
    }

    render(
      createElement(PreviewCanvas, {
        imageRef: { current: image },
        imageVersion: 1,
        params: defaultParams,
        lutDataRef: { current: null },
        lutDataVersion: 0,
      }),
    )

    await waitFor(() => {
      expect(pipelineMock.instances).toHaveLength(1)
      expect(pipelineMock.instances[0]?.uploadImage).toHaveBeenCalledWith(
        expect.objectContaining({
          renderExposureEv: 1.25,
          renderExposureMultiplier: Math.pow(2, 1.25),
        }),
      )
    })
  })

  it('does not publish a pipeline after unmount during async initialization', async () => {
    const initialize = deferred<void>()
    const onPipelineChange = vi.fn()
    pipelineMock.initialize.mockReturnValueOnce(initialize.promise)

    const { unmount } = render(
      createElement(PreviewCanvas, {
        imageRef: { current: null },
        imageVersion: 0,
        params: defaultParams,
        lutDataRef: { current: null },
        lutDataVersion: 0,
        onPipelineChange,
      }),
    )

    expect(pipelineMock.instances).toHaveLength(1)
    const [pipeline] = pipelineMock.instances

    act(() => {
      unmount()
    })

    await act(async () => {
      initialize.resolve()
      await initialize.promise
      await Promise.resolve()
    })

    expect(pipeline.disposeMock).toHaveBeenCalledTimes(1)
    expect(onPipelineChange).toHaveBeenCalledWith(null)
    expect(onPipelineChange).not.toHaveBeenCalledWith(pipeline)
  })

  it('disposes the preview pipeline while suspended and recovers after resume', async () => {
    const onPipelineChange = vi.fn()

    const props = {
      imageRef: { current: null },
      imageVersion: 0,
      params: defaultParams,
      lutDataRef: { current: null },
      lutDataVersion: 0,
      onPipelineChange,
    }
    const { rerender } = render(
      createElement(PreviewCanvas, {
        ...props,
      }),
    )

    await waitFor(() => {
      expect(onPipelineChange).toHaveBeenCalledWith(pipelineMock.instances[0])
    })

    const firstPipeline = pipelineMock.instances[0]!

    rerender(
      createElement(PreviewCanvas, {
        ...props,
        suspended: true,
      }),
    )

    expect(firstPipeline.disposeMock).toHaveBeenCalledWith({
      releaseContext: false,
    })
    expect(onPipelineChange).toHaveBeenCalledWith(null)
    expect(pipelineMock.instances).toHaveLength(1)

    rerender(
      createElement(PreviewCanvas, {
        ...props,
        suspended: false,
      }),
    )

    await waitFor(() => {
      expect(onPipelineChange).toHaveBeenCalledWith(pipelineMock.instances[1])
    })
  })

  it('zooms the preview around the wheel pointer without mutating processing params', async () => {
    const paramsBefore = { ...defaultParams }
    const { frame, onPreviewViewportChange } = renderInteractivePreview()

    await waitFor(() => {
      expect(pipelineMock.instances).toHaveLength(1)
    })

    const rafCallbacks: FrameRequestCallback[] = []
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb) => {
        rafCallbacks.push(cb)
        return rafCallbacks.length
      })

    expect(frame).not.toBeNull()
    fireEvent.wheel(frame!, {
      clientX: 300,
      clientY: 150,
      deltaY: -150,
      deltaMode: 0,
      ctrlKey: false,
    })

    expect(onPreviewViewportChange).not.toHaveBeenCalled()
    rafCallbacks[0]?.(performance.now())

    expect(onPreviewViewportChange).toHaveBeenCalledTimes(1)
    const next = onPreviewViewportChange.mock.calls[0]?.[0]
    expect(next?.zoom).toBeCloseTo(1.5)
    expect(next?.panX).toBeCloseTo(-50)
    expect(next?.panY).toBeCloseTo(0)
    expect(next?.fitMode).toBe('custom')
    expect(defaultParams).toEqual(paramsBefore)

    raf.mockRestore()
  })

  it('keeps the compare split track separate from the transformed preview surface', async () => {
    const { surface, track } = renderInteractivePreview({
      previewViewport: {
        zoom: 2,
        panX: 80,
        panY: -40,
        fitMode: 'custom',
      },
    })

    await waitFor(() => {
      expect(pipelineMock.instances).toHaveLength(1)
    })

    expect(track).not.toBeNull()
    expect(surface).not.toBeNull()
    expect(track).not.toBe(surface)
    expect(track?.style.getPropertyValue('--raw-preview-zoom')).toBe('')
    expect(surface?.style.getPropertyValue('--raw-preview-zoom')).toBe('2')
  })

  it('pans a zoomed preview with pointer drag', async () => {
    const { frame, onPreviewViewportChange } = renderInteractivePreview({
      previewViewport: { zoom: 2, panX: 0, panY: 0, fitMode: 'custom' },
    })

    await waitFor(() => {
      expect(pipelineMock.instances).toHaveLength(1)
    })

    const rafCallbacks: FrameRequestCallback[] = []
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb) => {
        rafCallbacks.push(cb)
        return rafCallbacks.length
      })

    expect(frame).not.toBeNull()
    fireEvent.pointerDown(frame!, {
      pointerId: 1,
      button: 0,
      clientX: 200,
      clientY: 150,
    })
    fireEvent.pointerMove(frame!, {
      pointerId: 1,
      clientX: 240,
      clientY: 170,
    })

    expect(onPreviewViewportChange).not.toHaveBeenCalled()
    rafCallbacks[0]?.(performance.now())

    expect(onPreviewViewportChange).toHaveBeenCalled()
    const next = onPreviewViewportChange.mock.calls.at(-1)?.[0]
    expect(next).toEqual({
      zoom: 2,
      panX: 40,
      panY: 20,
      fitMode: 'custom',
    })

    raf.mockRestore()
  })

  it('resets preview zoom and pan on double click', async () => {
    const { frame, onPreviewViewportChange } = renderInteractivePreview({
      previewViewport: {
        zoom: 3,
        panX: 120,
        panY: -80,
        fitMode: 'custom',
      },
    })

    await waitFor(() => {
      expect(pipelineMock.instances).toHaveLength(1)
    })

    expect(frame).not.toBeNull()
    fireEvent.doubleClick(frame!)

    expect(onPreviewViewportChange).toHaveBeenCalledWith(
      DEFAULT_PREVIEW_VIEWPORT,
    )
  })
})
