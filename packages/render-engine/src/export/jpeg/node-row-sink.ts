import { createBytesOutputResult } from './output-result'
import type { JpegRowSink } from './row-writer'

export type BytesJpegEncoder = {
  writeRows: (rows: Uint8Array, rowCount: number) => Promise<void>
  finish: () => Promise<Uint8Array>
  abort: () => void
}

export type BytesJpegRuntime = {
  createEncoder: (options: {
    width: number
    height: number
    quality: number
  }) => BytesJpegEncoder
  dispose: () => void
}

export function createNodeJpegRowSink(runtime: BytesJpegRuntime): JpegRowSink {
  return {
    createSession({ width, height, quality }) {
      const encoder = runtime.createEncoder({ width, height, quality })
      let state: 'open' | 'closed' | 'aborted' = 'open'

      function ensureOpen() {
        if (state === 'aborted') {
          throw new Error('JPEG_WRITER_ABORTED')
        }
        if (state === 'closed') {
          throw new Error('JPEG_WRITER_CLOSED')
        }
      }

      function abortEncoder() {
        if (state === 'aborted' || state === 'closed') {
          return
        }
        state = 'aborted'
        encoder.abort()
      }

      return {
        async writeRows(rows, rowCount) {
          ensureOpen()

          try {
            await encoder.writeRows(rows, rowCount)
          } catch (error) {
            try {
              abortEncoder()
            } catch {
              // Preserve the original encoder failure.
            }
            throw error
          }
        },
        async close() {
          ensureOpen()

          try {
            const bytes = await encoder.finish()
            state = 'closed'
            return createBytesOutputResult({
              filename: 'export.jpg',
              bytes,
            })
          } catch (error) {
            try {
              abortEncoder()
            } catch {
              // Preserve the original finish failure.
            }
            throw error
          }
        },
        async abort() {
          abortEncoder()
        },
      }
    },
  }
}
