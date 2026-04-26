import type {
  JpegWorkerRequest,
  JpegWorkerResponse,
} from '../worker/runtime-core'

export type LumaJpegEncoderOptions = {
  width: number
  height: number
  quality: number
}

export type LumaJpegEncoder = {
  writeRows: (rows: Uint8Array, rowCount: number) => Promise<void>
  finish: () => Promise<Blob>
  abort: () => void
}

export type LumaJpegRuntime = {
  createEncoder: (options: LumaJpegEncoderOptions) => LumaJpegEncoder
  dispose: () => void
}

export type LumaJpegRuntimeOptions = {
  workerFactory?: () => Worker
}

type JpegWorkerErrorResponse = {
  id: string
  ok: false
  type: JpegWorkerRequest['type']
  error: { message: string }
}

type WorkerResponse = JpegWorkerResponse | JpegWorkerErrorResponse

const defaultWorkerFactory = () =>
  new Worker(new URL('../worker/runtime.worker.ts', import.meta.url), {
    type: 'module',
  })

export function createLumaJpegRuntime(
  options: LumaJpegRuntimeOptions = {},
): LumaJpegRuntime {
  const worker = (options.workerFactory ?? defaultWorkerFactory)()
  const pending = new Map<
    string,
    {
      resolve: (response: JpegWorkerResponse) => void
      reject: (error: Error) => void
    }
  >()
  let nextRequestId = 0
  let disposed = false

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data
    const request = pending.get(response.id)
    if (!request) {
      return
    }

    pending.delete(response.id)

    if (response.ok) {
      request.resolve(response)
      return
    }

    request.reject(new Error(response.error.message || 'JPEG_RUNTIME_WORKER_ERROR'))
  }

  worker.onerror = (event) => {
    const message = event.message || 'JPEG_RUNTIME_WORKER_ERROR'
    for (const request of pending.values()) {
      request.reject(new Error(message))
    }
    pending.clear()
  }

  function sendRequest(request: Omit<JpegWorkerRequest, 'id'>) {
    if (disposed) {
      return Promise.reject(new Error('JPEG_RUNTIME_DISPOSED'))
    }

    const id = `jpeg-${(nextRequestId += 1)}`
    const message = { ...request, id } as JpegWorkerRequest

    return new Promise<JpegWorkerResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      try {
        worker.postMessage(message)
      } catch (error) {
        pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  return {
    createEncoder(encoderOptions) {
      let state: 'open' | 'finished' | 'aborted' = 'open'
      const createPromise = sendRequest({
        type: 'create',
        payload: encoderOptions,
      })

      return {
        async writeRows(rows, rowCount) {
          if (state === 'finished') {
            throw new Error('JPEG_RUNTIME_FINISHED')
          }
          if (state === 'aborted') {
            throw new Error('JPEG_RUNTIME_ABORTED')
          }

          await createPromise
          await sendRequest({
            type: 'rows',
            payload: { rows, rowCount },
          })
        },

        async finish() {
          if (state === 'finished') {
            throw new Error('JPEG_RUNTIME_FINISHED')
          }
          if (state === 'aborted') {
            throw new Error('JPEG_RUNTIME_ABORTED')
          }

          await createPromise
          const response = await sendRequest({
            type: 'finish',
            payload: {},
          })
          if (response.type !== 'finish') {
            throw new Error('JPEG_RUNTIME_UNEXPECTED_RESPONSE')
          }

          state = 'finished'
          return response.payload.blob
        },

        abort() {
          if (state !== 'open') {
            return
          }

          state = 'aborted'
          void createPromise
            .then(() =>
              sendRequest({
                type: 'abort',
                payload: {},
              }),
            )
            .catch(() => {})
        },
      }
    },

    dispose() {
      if (disposed) {
        return
      }

      disposed = true
      for (const request of pending.values()) {
        request.reject(new Error('JPEG_RUNTIME_DISPOSED'))
      }
      pending.clear()
      worker.terminate()
    },
  }
}
