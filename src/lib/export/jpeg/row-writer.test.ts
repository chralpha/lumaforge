import { createJpegRowWriter } from './row-writer'

describe('createJpegRowWriter', () => {
  it('writes rows incrementally and closes to a JPEG blob', async () => {
    const calls: Array<{ type: string; rowCount?: number; rows?: Uint8Array }> = []
    const writer = createJpegRowWriter({
      width: 2,
      height: 2,
      quality: 0.9,
      sink: {
        createSession() {
          return {
            async writeRows(rows, rowCount) {
              calls.push({ type: 'rows', rows, rowCount })
            },
            async close() {
              calls.push({ type: 'close' })
              return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
                type: 'image/jpeg',
              })
            },
            async abort() {
              calls.push({ type: 'abort' })
            },
          }
        },
      },
    })

    await writer.writeRows(new Uint8Array([255, 0, 0, 0, 255, 0]), 1)
    await writer.writeRows(new Uint8Array([0, 0, 255, 255, 255, 255]), 1)

    await expect(writer.close()).resolves.toMatchObject({ type: 'image/jpeg' })
    expect(calls).toEqual([
      {
        type: 'rows',
        rows: new Uint8Array([255, 0, 0, 0, 255, 0]),
        rowCount: 1,
      },
      {
        type: 'rows',
        rows: new Uint8Array([0, 0, 255, 255, 255, 255]),
        rowCount: 1,
      },
      { type: 'close' },
    ])
  })

  it('fails closed when row count exceeds image height', async () => {
    const writer = createJpegRowWriter({
      width: 1,
      height: 1,
      quality: 0.9,
      sink: {
        createSession() {
          return {
            async writeRows() {},
            async close() {
              return new Blob()
            },
            async abort() {},
          }
        },
      },
    })

    await writer.writeRows(new Uint8Array([0, 0, 0]), 1)

    await expect(writer.writeRows(new Uint8Array([0, 0, 0]), 1)).rejects.toThrow(
      'JPEG_ROW_COUNT_EXCEEDED',
    )
  })

  it('aborts the sink session when close is attempted before the image is complete', async () => {
    const calls: string[] = []
    const writer = createJpegRowWriter({
      width: 1,
      height: 2,
      quality: 0.9,
      sink: {
        createSession() {
          return {
            async writeRows() {
              calls.push('rows')
            },
            async close() {
              calls.push('close')
              return new Blob()
            },
            async abort() {
              calls.push('abort')
            },
          }
        },
      },
    })

    await writer.writeRows(new Uint8Array([255, 255, 255]), 1)

    await expect(writer.close()).rejects.toThrow('JPEG_INCOMPLETE_IMAGE')
    expect(calls).toEqual(['rows', 'abort'])
  })
})
