import { createLumaJpegRuntime } from './runtime'

describe('createLumaJpegRuntime', () => {
  it('fails closed until a row-oriented encoder exists', () => {
    expect(() => createLumaJpegRuntime()).toThrow('JPEG_RUNTIME_UNAVAILABLE')
  })
})
