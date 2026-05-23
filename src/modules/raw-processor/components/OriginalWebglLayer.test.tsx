import { render, waitFor } from '@testing-library/react'

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
})
