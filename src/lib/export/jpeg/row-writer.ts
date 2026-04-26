export type JpegRowSink = {
  encode: (input: {
    width: number
    height: number
    quality: number
    rows: Uint8Array[]
  }) => Promise<Blob>
}

export type JpegRowWriter = {
  writeRows: (rgbRows: Uint8Array, rowCount: number) => void
  close: () => Promise<Blob>
  abort: () => void
}

export function createJpegRowWriter(input: {
  width: number
  height: number
  quality: number
  sink: JpegRowSink
}): JpegRowWriter {
  const rows: Uint8Array[] = []
  let writtenRows = 0
  let aborted = false

  return {
    writeRows(rgbRows, rowCount) {
      if (aborted) throw new Error('JPEG_WRITER_ABORTED')
      if (rowCount <= 0 || !Number.isInteger(rowCount)) {
        throw new Error('JPEG_INVALID_ROW_COUNT')
      }
      if (rgbRows.length !== input.width * rowCount * 3) {
        throw new Error('JPEG_ROW_LENGTH_MISMATCH')
      }
      if (writtenRows + rowCount > input.height) {
        throw new Error('JPEG_ROW_COUNT_EXCEEDED')
      }
      rows.push(new Uint8Array(rgbRows))
      writtenRows += rowCount
    },
    async close() {
      if (aborted) throw new Error('JPEG_WRITER_ABORTED')
      if (writtenRows !== input.height) {
        throw new Error('JPEG_INCOMPLETE_IMAGE')
      }
      return input.sink.encode({
        width: input.width,
        height: input.height,
        quality: input.quality,
        rows,
      })
    },
    abort() {
      aborted = true
      rows.length = 0
    },
  }
}
