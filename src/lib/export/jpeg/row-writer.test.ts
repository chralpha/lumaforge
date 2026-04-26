import { createJpegRowWriter } from './row-writer'

it('writes rows and closes to a JPEG blob', async () => {
  const writer = createJpegRowWriter({
    width: 2,
    height: 2,
    quality: 0.9,
    sink: {
      async encode({ rows }) {
        expect(rows).toHaveLength(2)
        return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
          type: 'image/jpeg',
        })
      },
    },
  })

  writer.writeRows(new Uint8Array([255, 0, 0, 0, 255, 0]), 1)
  writer.writeRows(new Uint8Array([0, 0, 255, 255, 255, 255]), 1)

  await expect(writer.close()).resolves.toMatchObject({ type: 'image/jpeg' })
})

it('fails closed when row count exceeds image height', () => {
  const writer = createJpegRowWriter({
    width: 1,
    height: 1,
    quality: 0.9,
    sink: { encode: async () => new Blob() },
  })

  writer.writeRows(new Uint8Array([0, 0, 0]), 1)

  expect(() => writer.writeRows(new Uint8Array([0, 0, 0]), 1)).toThrow(
    'JPEG_ROW_COUNT_EXCEEDED',
  )
})
