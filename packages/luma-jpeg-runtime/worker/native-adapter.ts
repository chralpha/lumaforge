import type { InternalJpegEncoder } from './runtime-core'

type NativeJpegEncoder = {
  writeRows: (rows: Uint8Array, rowCount: number) => number | void
  finish: () => Uint8Array
  abort: () => void
  delete?: () => void
}

export type NativeJpegModule = {
  LumaJpegEncoder: new (
    width: number,
    height: number,
    quality: number,
  ) => NativeJpegEncoder
  getExceptionMessage?: (error: unknown) => string[] | undefined
  decrementExceptionRefcount?: (error: unknown) => void
}

export type NativeJpegEncoderFactoryInput = {
  width: number
  height: number
  quality: number
}

function createJpegBlob(bytes: Uint8Array) {
  const byteBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  const blob = new Blob([byteBuffer], { type: 'image/jpeg' })
  if (typeof blob.arrayBuffer !== 'function') {
    Object.defineProperty(blob, 'arrayBuffer', {
      value: async () => byteBuffer.slice(0),
    })
  }
  return blob
}

function normalizeNativeError(module: NativeJpegModule, error: unknown) {
  if (error instanceof Error) {
    return error
  }

  let message: string | undefined
  if (module.getExceptionMessage) {
    try {
      message = module.getExceptionMessage(error)?.[1]
    } finally {
      module.decrementExceptionRefcount?.(error)
    }
  }

  if (typeof message === 'string' && message.length > 0) {
    return new Error(message, { cause: error })
  }

  return new Error(String(error), { cause: error })
}

function deleteNativeEncoder(encoder: NativeJpegEncoder) {
  try {
    encoder.delete?.()
  } catch {
    // Native delete is a cleanup path; preserve the operation error that made
    // the wrapper terminal.
  }
}

export function createNativeJpegEncoderFactory(module: NativeJpegModule) {
  return (input: NativeJpegEncoderFactoryInput): InternalJpegEncoder => {
    let encoder: NativeJpegEncoder
    try {
      encoder = new module.LumaJpegEncoder(
        input.width,
        input.height,
        input.quality,
      )
    } catch (error) {
      throw normalizeNativeError(module, error)
    }

    let aborted = false
    let finished = false

    return {
      async writeRows(rows, rowCount) {
        if (aborted) throw new Error('JPEG_RUNTIME_ABORTED')
        if (finished) throw new Error('JPEG_RUNTIME_FINISHED')
        try {
          encoder.writeRows(rows, rowCount)
        } catch (error) {
          aborted = true
          deleteNativeEncoder(encoder)
          throw normalizeNativeError(module, error)
        }
      },
      async finish() {
        if (aborted) throw new Error('JPEG_RUNTIME_ABORTED')
        if (finished) throw new Error('JPEG_RUNTIME_FINISHED')
        let bytes: Uint8Array
        try {
          bytes = encoder.finish()
        } catch (error) {
          finished = true
          deleteNativeEncoder(encoder)
          throw normalizeNativeError(module, error)
        }
        finished = true
        deleteNativeEncoder(encoder)
        return createJpegBlob(bytes)
      },
      abort() {
        if (aborted || finished) return
        aborted = true
        try {
          encoder.abort()
        } catch (error) {
          deleteNativeEncoder(encoder)
          throw normalizeNativeError(module, error)
        }
        deleteNativeEncoder(encoder)
      },
    }
  }
}
