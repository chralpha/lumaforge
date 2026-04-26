import {
  createLumaJpegRuntime,
  type LumaJpegRuntime,
} from '@lumaforge/luma-jpeg-runtime'

import type { JpegRowSink } from './row-writer'

export function createWasmJpegRowSink(
  runtime: LumaJpegRuntime = createLumaJpegRuntime(),
): JpegRowSink {
  return {
    async encode({ width, height, quality, rows }) {
      const encoder = runtime.createEncoder({ width, height, quality })

      try {
        for (const rowChunk of rows) {
          await encoder.writeRows(rowChunk, rowChunk.length / (width * 3))
        }

        return await encoder.finish()
      } finally {
        runtime.dispose()
      }
    },
  }
}
