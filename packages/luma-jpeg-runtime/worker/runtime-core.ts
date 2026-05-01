export type JpegWorkerRequest =
  | {
      id: string
      type: 'create'
      payload: { width: number; height: number; quality: number }
    }
  | {
      id: string
      type: 'rows'
      payload: { rows: Uint8Array; rowCount: number }
    }
  | { id: string; type: 'finish'; payload: Record<string, never> }
  | { id: string; type: 'abort'; payload: Record<string, never> }

export type JpegWorkerChunk = {
  bytes: Uint8Array
  byteOffset: number
  final: boolean
}

export type JpegWorkerResponse =
  | {
      id: string
      ok: true
      type: 'create'
      payload: { created: true }
    }
  | {
      id: string
      ok: true
      type: 'rows'
      payload: { writtenRows: number }
    }
  | {
      id: string
      ok: true
      type: 'finish'
      payload: { blob: Blob }
    }
  | {
      id: string
      ok: true
      type: 'chunk'
      payload: JpegWorkerChunk
    }
  | {
      id: string
      ok: true
      type: 'abort'
      payload: { aborted: true }
    }

export type InternalJpegEncoder = {
  writeRows: (rows: Uint8Array, rowCount: number) => Promise<void>
  finish: () => Promise<Blob>
  drainChunks?: () =>
    | readonly JpegWorkerChunk[]
    | Promise<readonly JpegWorkerChunk[]>
  abort: () => void
}

export type InternalJpegEncoderFactory = (input: {
  width: number
  height: number
  quality: number
}) => InternalJpegEncoder

export type InternalJpegEncoderFactoryLoader =
  () => Promise<InternalJpegEncoderFactory>

export type JpegRuntimeCoreOptions = {
  onResponse?: (response: JpegWorkerResponse) => void | Promise<void>
}

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0
}

function isValidJpegQuality(value: number) {
  return Number.isFinite(value) && value > 0 && value <= 1
}

export function createJpegRuntimeCore(
  loadEncoderFactory: InternalJpegEncoderFactoryLoader,
  options: JpegRuntimeCoreOptions = {},
) {
  let width = 0
  let height = 0
  let writtenRows = 0
  let state: 'idle' | 'ready' | 'finished' | 'aborted' | 'failed' = 'idle'
  let encoderFactoryPromise: Promise<InternalJpegEncoderFactory> | null = null
  let encoder: InternalJpegEncoder | null = null

  async function getEncoderFactory() {
    encoderFactoryPromise ??= loadEncoderFactory()
    return encoderFactoryPromise
  }

  function getReadyEncoder() {
    if (state === 'idle') {
      throw new Error('JPEG_RUNTIME_NOT_CREATED')
    }
    if (state === 'finished') {
      throw new Error('JPEG_RUNTIME_FINISHED')
    }
    if (state === 'aborted' || state === 'failed') {
      throw new Error('JPEG_RUNTIME_ABORTED')
    }
    if (!encoder) {
      throw new Error('JPEG_RUNTIME_NOT_CREATED')
    }

    return encoder
  }

  function assertReady() {
    getReadyEncoder()
  }

  function markBackendFailure() {
    writtenRows = 0
    state = 'failed'
    encoder = null
  }

  async function emitChunks(
    requestId: string,
    activeEncoder: InternalJpegEncoder,
  ) {
    const chunks = await activeEncoder.drainChunks?.()
    if (!chunks) {
      return
    }

    for (const chunk of chunks) {
      await options.onResponse?.({
        id: requestId,
        ok: true,
        type: 'chunk',
        payload: chunk,
      })
    }
  }

  return {
    async handleRequest(
      request: JpegWorkerRequest,
    ): Promise<JpegWorkerResponse> {
      if (request.type === 'create') {
        if (state === 'failed') {
          throw new Error('JPEG_RUNTIME_ABORTED')
        }
        if (state === 'ready') {
          throw new Error('JPEG_RUNTIME_ENCODER_ACTIVE')
        }
        if (!isPositiveInteger(request.payload.width)) {
          throw new Error('JPEG_INVALID_WIDTH')
        }
        if (!isPositiveInteger(request.payload.height)) {
          throw new Error('JPEG_INVALID_HEIGHT')
        }
        if (!isValidJpegQuality(request.payload.quality)) {
          throw new Error('JPEG_INVALID_QUALITY')
        }

        const encoderFactory = await getEncoderFactory()
        width = request.payload.width
        height = request.payload.height
        writtenRows = 0
        encoder = encoderFactory(request.payload)
        state = 'ready'

        return {
          id: request.id,
          ok: true,
          type: request.type,
          payload: { created: true },
        }
      }

      if (request.type === 'rows') {
        const activeEncoder = getReadyEncoder()

        if (!isPositiveInteger(request.payload.rowCount)) {
          throw new Error('JPEG_INVALID_ROW_COUNT')
        }
        if (
          request.payload.rows.length !==
          width * request.payload.rowCount * 3
        ) {
          throw new Error('JPEG_ROW_LENGTH_MISMATCH')
        }
        if (writtenRows + request.payload.rowCount > height) {
          throw new Error('JPEG_ROW_COUNT_EXCEEDED')
        }

        try {
          await activeEncoder.writeRows(
            request.payload.rows,
            request.payload.rowCount,
          )
        } catch (error) {
          if (state === 'ready') {
            markBackendFailure()
          }
          throw error
        }
        assertReady()
        writtenRows += request.payload.rowCount

        return {
          id: request.id,
          ok: true,
          type: request.type,
          payload: { writtenRows },
        }
      }

      if (request.type === 'finish') {
        const activeEncoder = getReadyEncoder()

        if (writtenRows !== height) {
          throw new Error('JPEG_INCOMPLETE_IMAGE')
        }

        let blob: Blob
        try {
          blob = await activeEncoder.finish()
        } catch (error) {
          if (state === 'ready') {
            markBackendFailure()
          }
          throw error
        }
        assertReady()
        await emitChunks(request.id, activeEncoder)
        assertReady()
        state = 'finished'
        encoder = null

        return {
          id: request.id,
          ok: true,
          type: request.type,
          payload: { blob },
        }
      }

      const activeEncoder = getReadyEncoder()
      activeEncoder.abort()
      writtenRows = 0
      state = 'aborted'
      encoder = null

      return {
        id: request.id,
        ok: true,
        type: request.type,
        payload: { aborted: true },
      }
    },
  }
}
