import {
  createLumaJpegRuntime,
  type LumaJpegRuntime,
} from '@lumaforge/luma-jpeg-runtime'

import type { JpegRowSink } from './row-writer'

const JPEG_RUNTIME_UNAVAILABLE_MESSAGE =
  'Full-resolution JPEG export is not available in this browser build.'

function createJpegRuntimeUnavailableError(error: unknown) {
  const detail = error instanceof Error && error.message ? error.message : ''
  return new Error(
    detail
      ? `${JPEG_RUNTIME_UNAVAILABLE_MESSAGE} ${detail}`
      : JPEG_RUNTIME_UNAVAILABLE_MESSAGE,
    { cause: error },
  )
}

export function isWasmJpegRuntimeAvailable(
  runtimeFactory: () => LumaJpegRuntime = createLumaJpegRuntime,
) {
  let runtime: LumaJpegRuntime | null = null
  let encoder: ReturnType<LumaJpegRuntime['createEncoder']> | null = null

  try {
    runtime = runtimeFactory()
    encoder = runtime.createEncoder({ width: 1, height: 1, quality: 0.92 })
    encoder.abort()
    return true
  } catch {
    return false
  } finally {
    runtime?.dispose()
  }
}

export function createWasmJpegRowSink(
  runtimeFactory: () => LumaJpegRuntime = createLumaJpegRuntime,
): JpegRowSink {
  return {
    createSession({ width, height, quality }) {
      let runtime: LumaJpegRuntime
      try {
        runtime = runtimeFactory()
      } catch (error) {
        throw createJpegRuntimeUnavailableError(error)
      }

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
        throw createJpegRuntimeUnavailableError(error)
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
