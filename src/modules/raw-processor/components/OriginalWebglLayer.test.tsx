import { act, render, waitFor } from '@testing-library/react'

import type { DecodedImage } from '~/lib/raw/decoder'

import { OriginalWebglLayer } from './OriginalWebglLayer'

const decodedImage: DecodedImage = {
  width: 400,
  height: 300,
  channels: 3,
  bitsPerChannel: 16,
  data: new Uint16Array(400 * 300 * 3),
  layout: 'rgb-u16',
  colorSpace: 'linear-prophoto-rgb',
  source: 'quick',
  metadata: {
    width: 400,
    height: 300,
  },
  renderExposure: { ev: 0, multiplier: 1, source: 'identity' },
}

describe('originalWebglLayer', () => {
  it('renders technical-base original params into a left WebGL canvas', async () => {
    const setParams = vi.fn()
    const renderPipeline = vi.fn()

    render(
      <OriginalWebglLayer
        imageRef={{ current: decodedImage }}
        imageVersion={1}
        createPipeline={() =>
          ({
            initialize: vi.fn().mockResolvedValue(undefined),
            uploadImage: vi.fn(),
            setParams,
            render: renderPipeline,
            resize: vi.fn(),
            dispose: vi.fn(),
          }) as never
        }
      />,
    )

    await waitFor(() => expect(renderPipeline).toHaveBeenCalled())
    expect(setParams).toHaveBeenCalledWith(
      expect.objectContaining({
        viewMode: 'original',
        styleKind: 'none',
        intensity: 0,
      }),
    )
  })

  it('releases the WebGL context on unmount', async () => {
    const dispose = vi.fn()
    const renderPipeline = vi.fn()
    const { unmount } = render(
      <OriginalWebglLayer
        imageRef={{ current: decodedImage }}
        imageVersion={1}
        createPipeline={() =>
          ({
            initialize: vi.fn().mockResolvedValue(undefined),
            uploadImage: vi.fn(),
            setParams: vi.fn(),
            render: renderPipeline,
            resize: vi.fn(),
            dispose,
          }) as never
        }
      />,
    )

    await waitFor(() => expect(renderPipeline).toHaveBeenCalled())

    unmount()

    expect(dispose).toHaveBeenCalledWith({ releaseContext: true })
  })

  it('publishes an evacuation handle and clears it after disposal', async () => {
    const dispose = vi.fn()
    const onPipelineChange = vi.fn()

    render(
      <OriginalWebglLayer
        imageRef={{ current: decodedImage }}
        imageVersion={1}
        createPipeline={() =>
          ({
            initialize: vi.fn().mockResolvedValue(undefined),
            uploadImage: vi.fn(),
            setParams: vi.fn(),
            render: vi.fn(),
            resize: vi.fn(),
            dispose,
          }) as never
        }
        onPipelineChange={onPipelineChange}
      />,
    )

    await waitFor(() => {
      expect(onPipelineChange).toHaveBeenCalledWith(
        expect.objectContaining({ dispose: expect.any(Function) }),
      )
    })

    const handle = onPipelineChange.mock.calls.find(
      ([value]) => value && typeof value === 'object',
    )?.[0] as { dispose: () => void }

    act(() => {
      handle.dispose()
    })

    expect(dispose).toHaveBeenCalledWith({ releaseContext: true })
    expect(onPipelineChange).toHaveBeenLastCalledWith(null)
  })

  it('reports pipeline creation failures without leaking an async rejection', async () => {
    const onError = vi.fn()

    render(
      <OriginalWebglLayer
        imageRef={{ current: decodedImage }}
        imageVersion={1}
        createPipeline={() => {
          throw new Error('WebGL2 is not supported on this device')
        }}
        onError={onError}
      />,
    )

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'WebGL2 is not supported on this device',
        }),
      )
    })
  })

  it('reports render failures and releases the original WebGL context', async () => {
    const dispose = vi.fn()
    const onError = vi.fn()

    render(
      <OriginalWebglLayer
        imageRef={{ current: decodedImage }}
        imageVersion={1}
        createPipeline={() =>
          ({
            initialize: vi.fn().mockResolvedValue(undefined),
            uploadImage: vi.fn(() => {
              throw new Error('Original upload failed')
            }),
            setParams: vi.fn(),
            render: vi.fn(),
            resize: vi.fn(),
            dispose,
          }) as never
        }
        onError={onError}
      />,
    )

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Original upload failed' }),
      )
    })
    expect(dispose).toHaveBeenCalledWith({ releaseContext: true })
  })
})
