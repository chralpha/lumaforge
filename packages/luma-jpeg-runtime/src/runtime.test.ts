import { createLumaJpegRuntime } from './runtime'

describe('createLumaJpegRuntime', () => {
  it('fails closed until a row-oriented encoder exists', () => {
    expect(() => createLumaJpegRuntime()).toThrow('JPEG_RUNTIME_UNAVAILABLE')
  })

  it('accepts a worker factory while still failing closed', () => {
    expect(() =>
      createLumaJpegRuntime({
        workerFactory: () => ({ terminate() {} }) as unknown as Worker,
      }),
    ).toThrow('JPEG_RUNTIME_UNAVAILABLE')
  })
})
