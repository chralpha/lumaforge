import { describe, expect, it } from 'vitest'

import { createRawUploadInput } from './PreviewCanvas'

describe('preview canvas upload descriptor', () => {
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
      }),
    ).toEqual({
      data,
      layout: 'rgb-u16',
      colorSpace: 'linear-prophoto-rgb',
      width: 1,
      height: 1,
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
})
