import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps, RefObject } from 'react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DecodedImage } from '~/lib/raw/decoder'

import type { OriginalReferenceSnapshot } from '../services/compare/original-reference-snapshot'
import { DEFAULT_PREVIEW_VIEWPORT } from '../services/preview/preview-viewport'
import {
  createRawUploadInput,
  syncRawUploadInput,
} from './preview-canvas-helpers'
import { PreviewCanvas } from './PreviewCanvas'

const pipelineMock = vi.hoisted(() => ({
  instances: [] as Array<{
    canvas: HTMLCanvasElement
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
  renderEvents: [] as Array<{ kind: 'original' | 'processed' }>,
  pipelineEvents: [] as Array<{
    kind: 'original' | 'processed'
    op: 'upload' | 'render'
    width?: number
    height?: number
  }>,
}))

vi.mock('~/lib/gl/pipeline', () => ({
  RawProcessingPipeline: vi
    .fn()
    .mockImplementation((canvas: HTMLCanvasElement) => {
      const disposeMock = vi.fn()
      let lastUploadedSize: { width: number; height: number } | null = null
      const getKind = () =>
        canvas.className.includes('raw-preview-original-webgl-canvas')
          ? 'original'
          : 'processed'
      const instance = {
        canvas,
        initialize: vi.fn(() => pipelineMock.initialize(canvas)),
        dispose: disposeMock,
        disposeMock,
        resize: vi.fn(),
        render: vi.fn(() => {
          const kind = getKind()
          pipelineMock.renderEvents.push({ kind })
          pipelineMock.pipelineEvents.push({
            kind,
            op: 'render',
            width: lastUploadedSize?.width,
            height: lastUploadedSize?.height,
          })
          return { renderMs: 1 }
        }),
        clearImage: vi.fn(),
        uploadImage: vi.fn((input) => {
          const kind = getKind()
          lastUploadedSize = {
            width: input.width,
            height: input.height,
          }
          pipelineMock.pipelineEvents.push({
            kind,
            op: 'upload',
            width: input.width,
            height: input.height,
          })
        }),
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
  userTemperature: 0,
  userTint: 0,
  intensity: 0.7,
  viewMode: 'processed',
  compareSplit: 0.5,
  styleKind: 'none',
  builtinPreset: null,
}

const previewCanvasCss = readFileSync(
  resolve(
    process.cwd(),
    'src/modules/raw-processor/components/preview-canvas.css',
  ),
  'utf8',
)

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

function getPipelineParamCalls() {
  return pipelineMock.instances.flatMap((instance) =>
    instance.setParams.mock.calls.map(([params]) => params),
  )
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
    pipelineMock.renderEvents.length = 0
    pipelineMock.pipelineEvents.length = 0
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
    vi.stubGlobal('CSS', {
      supports: vi.fn(() => true),
    })
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
      releaseContext: true,
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

  it('uses layered dual-webgl compare and keeps the processed canvas out of shader compare mode', async () => {
    const snapshot: OriginalReferenceSnapshot = {
      key: 'original-reference|session:test',
      objectUrl: 'blob:original-reference',
      width: 400,
      height: 300,
      source: 'quick',
      mimeType: 'image/jpeg',
      estimatedBytes: 1024,
    }

    const { container } = render(
      createElement(PreviewCanvas, {
        imageRef: { current: decodedImage },
        imageVersion: 1,
        params: {
          ...defaultParams,
          viewMode: 'compare',
        },
        lutDataRef: { current: null },
        lutDataVersion: 0,
        dualWebglAllowed: true,
        originalReferenceSnapshot: snapshot,
      }),
    )

    await waitFor(() => {
      expect(
        container.querySelector('[data-compare-mode="dual-webgl"]'),
      ).toBeTruthy()
    })

    expect(
      container.querySelector('.raw-preview-original-webgl-layer'),
    ).toBeTruthy()
    expect(container.querySelector('.raw-preview-original-layer')).toBeNull()
    expect(container.querySelector('.raw-preview-processed-layer')).toHaveClass(
      'raw-preview-layer-clipped',
    )
    await waitFor(() => {
      expect(getPipelineParamCalls()).toContainEqual(
        expect.objectContaining({
          viewMode: 'processed',
          compareSplit: 0.5,
        }),
      )
    })
    expect(getPipelineParamCalls()).not.toContainEqual(
      expect.objectContaining({ viewMode: 'compare' }),
    )
  })

  it('keeps the embedded preview clipped on the left while original WebGL warms', async () => {
    const originalInitialize = deferred<void>()
    pipelineMock.initialize.mockImplementation((canvas: HTMLCanvasElement) => {
      if (canvas.className.includes('raw-preview-original-webgl-canvas')) {
        return originalInitialize.promise
      }

      return Promise.resolve()
    })

    const { container } = render(
      createElement(PreviewCanvas, {
        imageRef: { current: { ...decodedImage, source: 'quick' } },
        imageVersion: 1,
        params: {
          ...defaultParams,
          viewMode: 'compare',
        },
        lutDataRef: { current: null },
        lutDataVersion: 0,
        embeddedPreviewUrl: 'blob:embedded-preview',
        displaySource: 'quick',
        dualWebglAllowed: true,
      }),
    )

    await waitFor(() => {
      expect(
        container.querySelector('[data-compare-mode="embedded-fallback"]'),
      ).toBeTruthy()
    })

    expect(
      container.querySelector('.raw-preview-original-layer img'),
    ).toHaveAttribute('src', 'blob:embedded-preview')
    expect(container.querySelector('.raw-preview-processed-layer')).toHaveClass(
      'raw-preview-layer-clipped',
    )

    await act(async () => {
      originalInitialize.resolve()
      await originalInitialize.promise
      await Promise.resolve()
    })
  })

  it('promotes bounded-HQ dual-webgl compare after the processed layer uploads the same generation', async () => {
    const imageRef: RefObject<DecodedImage | null> = {
      current: { ...decodedImage, source: 'quick' as const },
    }
    const props: ComponentProps<typeof PreviewCanvas> = {
      imageRef,
      imageVersion: 1,
      params: {
        ...defaultParams,
        viewMode: 'compare',
      },
      lutDataRef: { current: null },
      lutDataVersion: 0,
      displaySource: 'quick',
      dualWebglAllowed: true,
    }
    const { container, rerender } = render(createElement(PreviewCanvas, props))

    await waitFor(() => {
      expect(
        container.querySelector('[data-compare-mode="dual-webgl"]'),
      ).toBeTruthy()
    })
    pipelineMock.renderEvents.length = 0
    pipelineMock.pipelineEvents.length = 0

    imageRef.current = {
      ...decodedImage,
      source: 'bounded-hq',
      width: 420,
      height: 320,
      data: new Float32Array(420 * 320 * 4),
    }
    rerender(
      createElement(PreviewCanvas, {
        ...props,
        imageVersion: 2,
        displaySource: 'bounded-hq',
      }),
    )

    await waitFor(() => {
      expect(pipelineMock.renderEvents.length).toBeGreaterThanOrEqual(2)
    })

    expect(
      pipelineMock.renderEvents.slice(0, 2).map((event) => event.kind),
    ).toEqual(['original', 'processed'])
    const processedUploadIndex = pipelineMock.pipelineEvents.findIndex(
      (event) =>
        event.kind === 'processed' &&
        event.op === 'upload' &&
        event.width === 420 &&
        event.height === 320,
    )
    const processedRenderIndex = pipelineMock.pipelineEvents.findIndex(
      (event) =>
        event.kind === 'processed' &&
        event.op === 'render' &&
        event.width === 420 &&
        event.height === 320,
    )
    expect(processedUploadIndex).toBeGreaterThanOrEqual(0)
    expect(processedRenderIndex).toBeGreaterThan(processedUploadIndex)
    expect(
      container.querySelector('[data-compare-mode="dual-webgl"]'),
    ).toBeTruthy()
  })

  it('keeps dual-webgl compare ready after the preview image version changes', async () => {
    const imageRef = { current: decodedImage }
    const props: ComponentProps<typeof PreviewCanvas> = {
      imageRef,
      imageVersion: 1,
      params: {
        ...defaultParams,
        viewMode: 'compare',
      },
      lutDataRef: { current: null },
      lutDataVersion: 0,
      dualWebglAllowed: true,
    }
    const { container, rerender } = render(createElement(PreviewCanvas, props))

    await waitFor(() => {
      expect(
        container.querySelector('[data-compare-mode="dual-webgl"]'),
      ).toBeTruthy()
    })

    imageRef.current = {
      ...decodedImage,
      width: 420,
      height: 320,
      data: new Float32Array(420 * 320 * 4),
    }
    rerender(
      createElement(PreviewCanvas, {
        ...props,
        imageVersion: 2,
      }),
    )

    await waitFor(() => {
      const originalPipeline = pipelineMock.instances.find((instance) => {
        return instance.uploadImage.mock.calls.some(([input]) => {
          return input?.width === 420 && input?.height === 320
        })
      })

      expect(originalPipeline?.render).toHaveBeenCalled()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(
      container.querySelector('[data-compare-mode="dual-webgl"]'),
    ).toBeTruthy()
    expect(
      container.querySelector('.raw-preview-original-webgl-shell'),
    ).toHaveClass('raw-preview-layer-clipped')
  })

  it('requests jpeg fallback when the original WebGL layer fails', async () => {
    const requestOriginalReferenceFallback = vi.fn()
    pipelineMock.initialize.mockImplementation((canvas: HTMLCanvasElement) => {
      if (canvas.className.includes('raw-preview-original-webgl-canvas')) {
        return Promise.reject(new Error('Original layer failed'))
      }

      return Promise.resolve()
    })

    render(
      createElement(PreviewCanvas, {
        imageRef: { current: decodedImage },
        imageVersion: 1,
        params: {
          ...defaultParams,
          viewMode: 'compare',
        },
        lutDataRef: { current: null },
        lutDataVersion: 0,
        dualWebglAllowed: true,
        onRequestOriginalReferenceFallback: requestOriginalReferenceFallback,
      }),
    )

    await waitFor(() => {
      expect(requestOriginalReferenceFallback).toHaveBeenCalledTimes(1)
    })
  })

  it('uses jpeg fallback compare when a snapshot is ready and dual-webgl is unavailable', async () => {
    const snapshot: OriginalReferenceSnapshot = {
      key: 'original-reference|session:test',
      objectUrl: 'blob:original-reference',
      width: 400,
      height: 300,
      source: 'quick',
      mimeType: 'image/jpeg',
      estimatedBytes: 1024,
    }

    const { container } = render(
      createElement(PreviewCanvas, {
        imageRef: { current: decodedImage },
        imageVersion: 1,
        params: {
          ...defaultParams,
          viewMode: 'compare',
        },
        lutDataRef: { current: null },
        lutDataVersion: 0,
        dualWebglAllowed: false,
        originalReferenceSnapshot: snapshot,
      }),
    )

    await waitFor(() => {
      expect(
        container.querySelector('[data-compare-mode="jpeg-fallback"]'),
      ).toBeTruthy()
    })

    expect(
      container.querySelector('.raw-preview-original-layer img'),
    ).toHaveAttribute('src', 'blob:original-reference')
    expect(container.querySelector('.raw-preview-processed-layer')).toHaveClass(
      'raw-preview-layer-clipped',
    )
    await waitFor(() => {
      expect(getPipelineParamCalls()).toContainEqual(
        expect.objectContaining({
          viewMode: 'processed',
          compareSplit: 0.5,
        }),
      )
    })
    expect(getPipelineParamCalls()).not.toContainEqual(
      expect.objectContaining({ viewMode: 'compare' }),
    )
  })

  it('exposes structured processed-only compare fallback reasons', async () => {
    const { container, rerender } = render(
      createElement(PreviewCanvas, {
        imageRef: { current: decodedImage },
        imageVersion: 1,
        params: {
          ...defaultParams,
          viewMode: 'compare',
        },
        lutDataRef: { current: null },
        lutDataVersion: 0,
        dualWebglAllowed: false,
      }),
    )

    await waitFor(() => {
      expect(
        container.querySelector('[data-compare-mode="processed-only"]'),
      ).toHaveAttribute(
        'data-compare-fallback-reason',
        'jpeg-fallback-unavailable',
      )
    })

    vi.stubGlobal('CSS', {
      supports: vi.fn(() => false),
    })

    rerender(
      createElement(PreviewCanvas, {
        imageRef: { current: decodedImage },
        imageVersion: 2,
        params: {
          ...defaultParams,
          viewMode: 'compare',
        },
        lutDataRef: { current: null },
        lutDataVersion: 0,
        dualWebglAllowed: true,
      }),
    )

    await waitFor(() => {
      expect(
        container.querySelector('[data-compare-mode="processed-only"]'),
      ).toHaveAttribute('data-compare-fallback-reason', 'css-clip-unavailable')
    })
  })

  it('declares prefixed clip-path rules for prefixed WebKit layered compare', () => {
    expect(previewCanvasCss).toContain(
      '-webkit-clip-path: inset(0 calc(100% - var(--raw-compare-split, 50%)) 0 0);',
    )
    expect(previewCanvasCss).toContain(
      '-webkit-clip-path: inset(0 0 0 var(--raw-compare-split, 50%));',
    )
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

  it('keeps preview track as the split anchor while the surface fills surrounding frame space', async () => {
    const { frame, surface, track } = renderInteractivePreview({
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
    expect(track?.style.getPropertyValue('--raw-preview-zoom')).toBe('2')
    expect(track?.style.getPropertyValue('--raw-preview-pan-x')).toBe('80px')
    expect(track?.style.getPropertyValue('--raw-preview-pan-y')).toBe('-40px')
    expect(surface?.style.getPropertyValue('--raw-preview-zoom')).toBe('')
    expect(getComputedStyle(track!).transform).toBe('')
    expect(getComputedStyle(surface!).transform).toContain('translate3d')
    expect(getComputedStyle(frame!).overflow).toBe('hidden')
  })

  it('keeps layered compare clipping in layer space while zoom transforms the surface', async () => {
    const snapshot: OriginalReferenceSnapshot = {
      key: 'original-reference|session:test',
      objectUrl: 'blob:original-reference',
      width: 400,
      height: 300,
      source: 'quick',
      mimeType: 'image/jpeg',
      estimatedBytes: 1024,
    }

    const { container } = render(
      createElement(PreviewCanvas, {
        imageRef: { current: decodedImage },
        imageVersion: 1,
        params: {
          ...defaultParams,
          viewMode: 'compare',
        },
        lutDataRef: { current: null },
        lutDataVersion: 0,
        dualWebglAllowed: false,
        originalReferenceSnapshot: snapshot,
        previewViewport: {
          zoom: 2,
          panX: 80,
          panY: -40,
          fitMode: 'custom',
        },
      }),
    )

    await waitFor(() => {
      expect(
        container.querySelector('[data-compare-mode="jpeg-fallback"]'),
      ).toBeTruthy()
    })

    const surface = container.querySelector<HTMLElement>(
      '[data-raw-preview-surface]',
    )
    const processedLayer = container.querySelector<HTMLElement>(
      '.raw-preview-processed-layer',
    )
    const processedCanvas = container.querySelector<HTMLElement>(
      '.raw-preview-canvas',
    )
    const originalImage = container.querySelector<HTMLElement>(
      '.raw-preview-original-image',
    )
    const track = container.querySelector<HTMLElement>('.raw-preview-track')

    expect(track).not.toBeNull()
    expect(surface).not.toBeNull()
    expect(processedLayer).not.toBeNull()
    expect(processedCanvas).not.toBeNull()
    expect(originalImage).not.toBeNull()
    expect(getComputedStyle(track!).transform).toBe('')
    expect(getComputedStyle(surface!).transform).toContain('translate3d')
    expect(getComputedStyle(processedLayer!).clipPath).toContain(
      'var(--raw-compare-split',
    )
    expect(getComputedStyle(processedCanvas!).transform).toBe('')
    expect(getComputedStyle(originalImage!).transform).toBe('')
  })

  it('keeps the preview track hidden until aspect-fit sizing is ready', () => {
    const { container } = render(
      createElement(PreviewCanvas, {
        imageRef: { current: decodedImage },
        imageVersion: 1,
        params: defaultParams,
        lutDataRef: { current: null },
        lutDataVersion: 0,
      }),
    )

    const track = container.querySelector<HTMLElement>(
      '[data-raw-compare-track="image"]',
    )

    expect(track).toHaveAttribute('data-preview-track-ready', 'false')
    expect(previewCanvasCss).toContain(
      "[data-raw-compare-track='image'][data-preview-track-ready='false']",
    )
  })

  it('scopes transform will-change to active preview panning', async () => {
    const { container, frame } = renderInteractivePreview({
      previewViewport: {
        zoom: 2,
        panX: 0,
        panY: 0,
        fitMode: 'custom',
      },
    })

    await waitFor(() => {
      expect(pipelineMock.instances).toHaveLength(1)
    })

    const surface = container.querySelector<HTMLElement>(
      '[data-raw-preview-surface]',
    )
    expect(surface).not.toBeNull()
    expect(getComputedStyle(surface!).willChange).not.toContain('transform')

    fireEvent.pointerDown(frame!, {
      pointerId: 1,
      button: 0,
      clientX: 200,
      clientY: 150,
    })

    expect(getComputedStyle(surface!).willChange).toContain('transform')
  })

  it('does not rerender WebGL during split or viewport changes when layered compare is active', async () => {
    const snapshot: OriginalReferenceSnapshot = {
      key: 'original-reference|session:test',
      objectUrl: 'blob:original-reference',
      width: 400,
      height: 300,
      source: 'quick',
      mimeType: 'image/jpeg',
      estimatedBytes: 1024,
    }
    const props = {
      imageRef: { current: decodedImage },
      imageVersion: 1,
      params: {
        ...defaultParams,
        viewMode: 'compare' as const,
        compareSplit: 0.5,
      },
      lutDataRef: { current: null },
      lutDataVersion: 0,
      dualWebglAllowed: false,
      originalReferenceSnapshot: snapshot,
      previewViewport: DEFAULT_PREVIEW_VIEWPORT,
    }

    const { rerender } = render(createElement(PreviewCanvas, props))

    await waitFor(() => {
      expect(pipelineMock.instances[0]?.render).toHaveBeenCalled()
    })

    const processedPipeline = pipelineMock.instances[0]!
    processedPipeline.render.mockClear()

    rerender(
      createElement(PreviewCanvas, {
        ...props,
        params: {
          ...props.params,
          compareSplit: 0.8,
        },
      }),
    )
    rerender(
      createElement(PreviewCanvas, {
        ...props,
        params: {
          ...props.params,
          compareSplit: 0.8,
        },
        previewViewport: {
          zoom: 2,
          panX: 80,
          panY: 0,
          fitMode: 'custom',
        },
      }),
    )

    expect(processedPipeline.render).not.toHaveBeenCalled()
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
