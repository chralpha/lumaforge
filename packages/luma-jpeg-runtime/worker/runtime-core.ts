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
      type: 'abort'
      payload: { aborted: true }
    }

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0
}

export function createJpegRuntimeCore() {
  let width = 0
  let height = 0
  let writtenRows = 0
  let state: 'idle' | 'ready' | 'finished' | 'aborted' = 'idle'

  function assertReady() {
    if (state === 'idle') {
      throw new Error('JPEG_RUNTIME_NOT_CREATED')
    }
    if (state === 'finished') {
      throw new Error('JPEG_RUNTIME_FINISHED')
    }
    if (state === 'aborted') {
      throw new Error('JPEG_RUNTIME_ABORTED')
    }
  }

  return {
    async handleRequest(request: JpegWorkerRequest): Promise<JpegWorkerResponse> {
      if (request.type === 'create') {
        if (!isPositiveInteger(request.payload.width)) {
          throw new Error('JPEG_INVALID_WIDTH')
        }
        if (!isPositiveInteger(request.payload.height)) {
          throw new Error('JPEG_INVALID_HEIGHT')
        }

        width = request.payload.width
        height = request.payload.height
        writtenRows = 0
        state = 'ready'

        return {
          id: request.id,
          ok: true,
          type: request.type,
          payload: { created: true },
        }
      }

      if (request.type === 'rows') {
        assertReady()

        if (!isPositiveInteger(request.payload.rowCount)) {
          throw new Error('JPEG_INVALID_ROW_COUNT')
        }
        if (request.payload.rows.length !== width * request.payload.rowCount * 3) {
          throw new Error('JPEG_ROW_LENGTH_MISMATCH')
        }
        if (writtenRows + request.payload.rowCount > height) {
          throw new Error('JPEG_ROW_COUNT_EXCEEDED')
        }

        writtenRows += request.payload.rowCount

        return {
          id: request.id,
          ok: true,
          type: request.type,
          payload: { writtenRows },
        }
      }

      if (request.type === 'finish') {
        assertReady()

        if (writtenRows !== height) {
          throw new Error('JPEG_INCOMPLETE_IMAGE')
        }

        state = 'finished'
        throw new Error('JPEG_RUNTIME_UNAVAILABLE')
      }

      assertReady()
      writtenRows = 0
      state = 'aborted'

      return {
        id: request.id,
        ok: true,
        type: request.type,
        payload: { aborted: true },
      }
    },
  }
}
