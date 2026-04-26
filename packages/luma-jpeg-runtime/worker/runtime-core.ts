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

export function createJpegRuntimeCore() {
  let width = 0
  let height = 0
  let writtenRows = 0

  return {
    async handleRequest(request: JpegWorkerRequest): Promise<JpegWorkerResponse> {
      if (request.type === 'create') {
        width = request.payload.width
        height = request.payload.height
        writtenRows = 0

        return {
          id: request.id,
          ok: true,
          type: request.type,
          payload: { created: true },
        }
      }

      if (request.type === 'rows') {
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
        if (writtenRows !== height) {
          throw new Error('JPEG_INCOMPLETE_IMAGE')
        }

        throw new Error('JPEG_RUNTIME_UNAVAILABLE')
      }

      writtenRows = 0

      return {
        id: request.id,
        ok: true,
        type: request.type,
        payload: { aborted: true },
      }
    },
  }
}
