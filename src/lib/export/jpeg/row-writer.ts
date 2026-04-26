export type JpegRowSinkSession = {
  writeRows: (rgbRows: Uint8Array, rowCount: number) => Promise<void>
  close: () => Promise<Blob>
  abort: () => Promise<void> | void
}

export type JpegRowSink = {
  createSession: (input: {
    width: number
    height: number
    quality: number
  }) => JpegRowSinkSession
}

export type JpegRowWriter = {
  writeRows: (rgbRows: Uint8Array, rowCount: number) => Promise<void>
  close: () => Promise<Blob>
  abort: () => Promise<void>
}

export function createJpegRowWriter(input: {
  width: number
  height: number
  quality: number
  sink: JpegRowSink
}): JpegRowWriter {
  const session = input.sink.createSession({
    width: input.width,
    height: input.height,
    quality: input.quality,
  })

  let writtenRows = 0
  let state: 'open' | 'closed' | 'aborted' = 'open'

  async function abortSession() {
    if (state === 'aborted' || state === 'closed') {
      return
    }

    state = 'aborted'
    await session.abort()
  }

  function assertOpen() {
    if (state === 'aborted') {
      throw new Error('JPEG_WRITER_ABORTED')
    }
    if (state === 'closed') {
      throw new Error('JPEG_WRITER_CLOSED')
    }
  }

  return {
    async writeRows(rgbRows, rowCount) {
      assertOpen()

      if (rowCount <= 0 || !Number.isInteger(rowCount)) {
        throw new Error('JPEG_INVALID_ROW_COUNT')
      }
      if (rgbRows.length !== input.width * rowCount * 3) {
        throw new Error('JPEG_ROW_LENGTH_MISMATCH')
      }
      if (writtenRows + rowCount > input.height) {
        throw new Error('JPEG_ROW_COUNT_EXCEEDED')
      }

      try {
        await session.writeRows(new Uint8Array(rgbRows), rowCount)
        writtenRows += rowCount
      } catch (error) {
        try {
          await abortSession()
        } catch {
          // Preserve the original streaming failure.
        }
        throw error
      }
    },
    async close() {
      assertOpen()

      if (writtenRows !== input.height) {
        try {
          await abortSession()
        } catch {
          // Preserve the fail-closed incomplete image error.
        }
        throw new Error('JPEG_INCOMPLETE_IMAGE')
      }

      try {
        const blob = await session.close()
        state = 'closed'
        return blob
      } catch (error) {
        try {
          await abortSession()
        } catch {
          // Preserve the original close failure.
        }
        throw error
      }
    },
    async abort() {
      await abortSession()
    },
  }
}
