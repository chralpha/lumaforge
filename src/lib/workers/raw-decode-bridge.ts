import type { LumaRawRuntime } from '@lumaforge/luma-raw-runtime'

import { WorkerBridge } from './worker-bridge'

type RuntimeApi = Pick<
  LumaRawRuntime,
  | 'init'
  | 'openSession'
  | 'probe'
  | 'extractEmbeddedPreview'
  | 'decodeQuick'
  | 'decodeBoundedHq'
>

export interface RawDecodeBridgeOptions {
  runtimeFactory: () => LumaRawRuntime | Promise<LumaRawRuntime>
  idleMs?: number
}

export class RawDecodeBridge {
  private readonly bridge: WorkerBridge<RuntimeApi>

  constructor(options: RawDecodeBridgeOptions) {
    this.bridge = new WorkerBridge<RuntimeApi>({
      idleMs: options.idleMs,
      startWorker: async () => {
        const runtime = await options.runtimeFactory()
        const api: RuntimeApi = {
          init: runtime.init.bind(runtime),
          openSession: runtime.openSession.bind(runtime),
          probe: runtime.probe.bind(runtime),
          extractEmbeddedPreview: runtime.extractEmbeddedPreview.bind(runtime),
          decodeQuick: runtime.decodeQuick.bind(runtime),
          decodeBoundedHq: runtime.decodeBoundedHq.bind(runtime),
        }

        return {
          api,
          terminate: () => runtime.dispose(),
        }
      },
    })
  }

  prewarm(signal: AbortSignal): ReturnType<LumaRawRuntime['init']> {
    return this.bridge.call('init', signal)
  }

  openSession(
    signal: AbortSignal,
    ...args: Parameters<LumaRawRuntime['openSession']>
  ): ReturnType<LumaRawRuntime['openSession']> {
    return this.bridge.call('openSession', signal, ...args)
  }

  probe(
    signal: AbortSignal,
    ...args: Parameters<LumaRawRuntime['probe']>
  ): ReturnType<LumaRawRuntime['probe']> {
    return this.bridge.call('probe', signal, ...args)
  }

  decodeEmbedded(
    signal: AbortSignal,
    ...args: Parameters<LumaRawRuntime['extractEmbeddedPreview']>
  ): ReturnType<LumaRawRuntime['extractEmbeddedPreview']> {
    return this.bridge.call('extractEmbeddedPreview', signal, ...args)
  }

  decodeQuick(
    signal: AbortSignal,
    ...args: Parameters<LumaRawRuntime['decodeQuick']>
  ): ReturnType<LumaRawRuntime['decodeQuick']> {
    return this.bridge.call('decodeQuick', signal, ...args)
  }

  decodeBoundedHq(
    signal: AbortSignal,
    ...args: Parameters<LumaRawRuntime['decodeBoundedHq']>
  ): ReturnType<LumaRawRuntime['decodeBoundedHq']> {
    return this.bridge.call('decodeBoundedHq', signal, ...args)
  }

  terminate(): Promise<void> {
    return this.bridge.terminate()
  }
}
