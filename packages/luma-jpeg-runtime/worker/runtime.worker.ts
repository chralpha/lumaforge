import type {
  JpegWorkerRequest,
  JpegWorkerResponse,
} from './runtime-core'
import { createJpegRuntimeCore } from './runtime-core'

let core: ReturnType<typeof createJpegRuntimeCore> | undefined

type JpegWorkerErrorResponse = {
  id: string
  ok: false
  type: JpegWorkerRequest['type']
  error: { message: string }
}

function failureResponse(
  request: JpegWorkerRequest,
  error: unknown,
): JpegWorkerErrorResponse {
  return {
    id: request.id,
    ok: false,
    type: request.type,
    error: {
      message:
        error instanceof Error ? error.message : 'JPEG_RUNTIME_UNAVAILABLE',
    },
  }
}

self.onmessage = async (event: MessageEvent<JpegWorkerRequest>) => {
  const request = event.data

  try {
    core ??= createJpegRuntimeCore()
    const response: JpegWorkerResponse = await core.handleRequest(request)
    self.postMessage(response)
  } catch (error) {
    self.postMessage(failureResponse(request, error))
  }
}
