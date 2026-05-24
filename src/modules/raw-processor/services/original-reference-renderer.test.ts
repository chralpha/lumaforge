import type { DecodedImage } from '~/lib/raw/decoder'

import { renderOriginalReferenceSnapshot } from './original-reference-renderer'

const createObjectURL = vi.fn(() => 'blob:original-rendered')
const revokeObjectURL = vi.fn()

function createImage(): DecodedImage {
  return {
    width: 1600,
    height: 1000,
    channels: 3,
    bitsPerChannel: 16,
    data: new Uint16Array(1600 * 1000 * 3),
    layout: 'rgb-u16',
    colorSpace: 'linear-prophoto-rgb',
    source: 'quick',
    metadata: {
      width: 1600,
      height: 1000,
      make: 'Test',
      model: 'Fixture',
    },
    renderExposure: { ev: 0, multiplier: 1, source: 'identity' },
  }
}

describe('renderOriginalReferenceSnapshot', () => {
  beforeEach(() => {
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
  })

  it('renders original params, encodes a JPEG blob, and disposes the pipeline', async () => {
    const dispose = vi.fn()
    const uploadImage = vi.fn()
    const setParams = vi.fn()
    const render = vi.fn()

    const snapshot = await renderOriginalReferenceSnapshot({
      image: createImage(),
      key: 'snapshot-key',
      maxPixels: 1_000_000,
      createPipeline: () =>
        ({
          initialize: vi.fn().mockResolvedValue(undefined),
          uploadImage,
          setParams,
          render,
          dispose,
        }) as never,
      createCanvas: () =>
        ({
          width: 0,
          height: 0,
          toBlob: (callback: BlobCallback) =>
            callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
        }) as HTMLCanvasElement,
      createObjectURL,
      revokeObjectURL,
    })

    expect(uploadImage).toHaveBeenCalledOnce()
    expect(uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1264,
        height: 790,
        data: expect.any(Uint16Array),
      }),
    )
    expect(uploadImage.mock.calls[0]?.[0].data).toHaveLength(1264 * 790 * 3)
    expect(setParams).toHaveBeenCalledWith(
      expect.objectContaining({
        viewMode: 'original',
        styleKind: 'none',
        intensity: 0,
      }),
    )
    expect(render).toHaveBeenCalledWith({ waitForGpu: true })
    expect(dispose).toHaveBeenCalledWith({ releaseContext: true })
    expect(snapshot.width * snapshot.height).toBeLessThanOrEqual(1_000_000)
    expect(snapshot).toMatchObject({
      key: 'snapshot-key',
      objectUrl: 'blob:original-rendered',
      width: 1264,
      height: 790,
      source: 'quick',
      mimeType: 'image/jpeg',
      estimatedBytes: 4,
    })
  })

  it('disposes the pipeline and revokes partial output when encoding fails', async () => {
    const dispose = vi.fn()

    await expect(
      renderOriginalReferenceSnapshot({
        image: createImage(),
        key: 'snapshot-key',
        maxPixels: 1_000_000,
        createPipeline: () =>
          ({
            initialize: vi.fn().mockResolvedValue(undefined),
            uploadImage: vi.fn(),
            setParams: vi.fn(),
            render: vi.fn(),
            dispose,
          }) as never,
        createCanvas: () =>
          ({
            width: 0,
            height: 0,
            toBlob: (callback: BlobCallback) => callback(null),
          }) as HTMLCanvasElement,
        createObjectURL,
        revokeObjectURL,
      }),
    ).rejects.toThrow('ORIGINAL_REFERENCE_SNAPSHOT_ENCODE_FAILED')

    expect(dispose).toHaveBeenCalledWith({ releaseContext: true })
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('releases the temporary pipeline promptly when snapshot rendering is aborted', async () => {
    const dispose = vi.fn()
    const uploadImage = vi.fn()
    const setParams = vi.fn()
    const render = vi.fn()
    let finishEncode!: (blob: Blob | null) => void
    const abortController = new AbortController()

    const renderPromise = renderOriginalReferenceSnapshot({
      image: createImage(),
      key: 'snapshot-key',
      maxPixels: 1_000_000,
      signal: abortController.signal,
      createPipeline: () =>
        ({
          initialize: vi.fn().mockResolvedValue(undefined),
          uploadImage,
          setParams,
          render,
          dispose,
        }) as never,
      createCanvas: () =>
        ({
          width: 0,
          height: 0,
          toBlob: (callback: BlobCallback) => {
            finishEncode = callback
          },
        }) as HTMLCanvasElement,
      createObjectURL,
      revokeObjectURL,
    })

    await vi.waitFor(() => expect(render).toHaveBeenCalled())
    abortController.abort()

    expect(dispose).toHaveBeenCalledWith({ releaseContext: true })
    finishEncode(new Blob(['jpeg'], { type: 'image/jpeg' }))

    await expect(renderPromise).rejects.toThrow(
      'ORIGINAL_REFERENCE_SNAPSHOT_ABORTED',
    )
    expect(createObjectURL).not.toHaveBeenCalled()
  })
})
