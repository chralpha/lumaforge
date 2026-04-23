import type {
  LumaRawWorkerRequest,
  LumaRawWorkerResponse,
} from '../src/worker-protocol'

const worker = self as DedicatedWorkerGlobalScope

worker.onmessage = (event: MessageEvent<LumaRawWorkerRequest>) => {
  const request = event.data
  const response = {
    id: request.id,
    ok: false,
    type: request.type,
    error: {
      code: 'RAW_RUNTIME_UNAVAILABLE',
      message: 'RAW runtime worker is not implemented yet.',
    },
  } satisfies LumaRawWorkerResponse

  worker.postMessage(response)
}
