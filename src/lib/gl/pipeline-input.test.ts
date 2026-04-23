import { describe, expect, it } from 'vitest'

import { describeRawUploadInput } from './pipeline'

describe('raw pipeline input descriptors', () => {
  it('describes legacy Float32 RGBA input', () => {
    expect(
      describeRawUploadInput({
        data: new Float32Array(4),
        width: 1,
        height: 1,
        layout: 'rgba-float32',
        colorSpace: 'display-srgb-preview',
      }),
    ).toEqual({
      inputFormat: 'float-rgba',
      channelCount: 4,
      bytesPerPixel: 16,
    })
  })

  it('describes Luma RGB16 input without expanding to RGBA', () => {
    expect(
      describeRawUploadInput({
        data: new Uint16Array(3),
        width: 1,
        height: 1,
        layout: 'rgb-u16',
        colorSpace: 'linear-prophoto-rgb',
      }),
    ).toEqual({
      inputFormat: 'uint16-rgb',
      channelCount: 3,
      bytesPerPixel: 6,
    })
  })
})
