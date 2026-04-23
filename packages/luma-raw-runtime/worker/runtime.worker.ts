import type {
  LumaRawWorkerRequest,
  LumaRawWorkerResponse,
} from '../src/worker-protocol'
import { loadNativeFactory } from './load-native-module'
import { createRuntimeCore } from './runtime-core'

let corePromise: ReturnType<typeof createCore>

async function createCore() {
  const nativeFactory = await loadNativeFactory()
  return createRuntimeCore(nativeFactory)
}

self.onmessage = async (event: MessageEvent<LumaRawWorkerRequest>) => {
  corePromise ??= createCore()
  const core = await corePromise
  const response = await core.handleRequest(event.data)
  const transfer: Transferable[] = []

  if (response.ok) {
    const payload = response.payload as { data?: Uint8Array | Uint16Array }
    if (payload?.data) {
      transfer.push(payload.data.buffer)
    }
  }

  self.postMessage(response satisfies LumaRawWorkerResponse, transfer)
}
