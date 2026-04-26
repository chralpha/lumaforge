import {
  createLumaJpegRuntime,
  type LumaJpegRuntime,
} from '@lumaforge/luma-jpeg-runtime'

import type { JpegRowSink } from './row-writer'

export function createWasmJpegRowSink(
  runtimeFactory: () => LumaJpegRuntime = createLumaJpegRuntime,
): JpegRowSink {
  return {
    createSession({ width, height, quality }) {
      const runtime = runtimeFactory()
      let disposed = false

      function disposeRuntime() {
        if (disposed) return
        disposed = true
        runtime.dispose()
      }

      let encoder
      try {
        encoder = runtime.createEncoder({ width, height, quality })
      } catch (error) {
        disposeRuntime()
        throw error
      }

      let state: 'open' | 'closed' | 'aborted' = 'open'

      function ensureOpen() {
        if (state === 'aborted') {
          throw new Error('JPEG_WRITER_ABORTED')
        }
        if (state === 'closed') {
          throw new Error('JPEG_WRITER_CLOSED')
        }
      }

      async function abortEncoder() {
        if (state === 'aborted' || state === 'closed') {
          return
        }

        state = 'aborted'
        try {
          encoder.abort()
        } finally {
          disposeRuntime()
        }
      }

      return {
        async writeRows(rows, rowCount) {
          ensureOpen()

          try {
            await encoder.writeRows(rows, rowCount)
          } catch (error) {
            try {
              await abortEncoder()
            } catch {
              // Preserve the original encoder failure.
            }
            throw error
          }
        },
        async close() {
          ensureOpen()

          try {
            const blob = await encoder.finish()
            state = 'closed'
            disposeRuntime()
            return blob
          } catch (error) {
            try {
              await abortEncoder()
            } catch {
              // Preserve the original finish failure.
            }
            throw error
          }
        },
        async abort() {
          await abortEncoder()
        },
      }
    },
  }
}
