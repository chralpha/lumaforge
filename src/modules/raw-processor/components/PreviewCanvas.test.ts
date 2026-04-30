import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import { act, render, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DecodedImage } from '~/lib/raw/decoder'

import {
  createRawUploadInput,
  PreviewCanvas,
  syncRawUploadInput,
} from './PreviewCanvas'

const pipelineMock = vi.hoisted(() => ({
  instances: [] as Array<{
    initialize: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
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
    const instance = {
      initialize: pipelineMock.initialize,
      dispose: vi.fn(),
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
  intensity: 0.7,
  viewMode: 'processed',
  compareSplit: 0.5,
  styleKind: 'none',
  builtinPreset: null,
}

describe('preview canvas upload descriptor', () => {
  beforeEach(() => {
    pipelineMock.instances.length = 0
    pipelineMock.initialize.mockReset()
    pipelineMock.initialize.mockResolvedValue(undefined)
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

    expect(pipeline.dispose).toHaveBeenCalledTimes(1)
    expect(onPipelineChange).toHaveBeenCalledWith(null)
    expect(onPipelineChange).not.toHaveBeenCalledWith(pipeline)
  })
})
