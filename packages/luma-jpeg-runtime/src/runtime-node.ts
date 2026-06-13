import { loadNativeModuleForNode } from '@lumaforge/luma-native-artifacts/load-for-node'

import { createNativeJpegEncoderFactory } from '../worker/native-adapter'
import type {InternalJpegEncoderFactoryLoader, JpegWorkerRequest, JpegWorkerResponse} from '../worker/runtime-core';
import {
  createJpegRuntimeCore
} from '../worker/runtime-core'
import type { LumaJpegChunk, LumaJpegEncoderOptions } from './runtime'

export type LumaJpegNodeNativeLoader = () => Promise<unknown>

export type LumaJpegNodeRuntimeOptions = {
  /**
   * Override the default native module loader (tests, custom artifact paths).
   * Returns the Emscripten module instance, matching the shape produced by
   * `@lumaforge/luma-native-artifacts/load-for-node`.
   */
  nativeLoader?: LumaJpegNodeNativeLoader
  /**
   * Optional callback invoked for each JPEG chunk produced when an encoder
   * is created with `finishMode: 'chunks'`. Receives Uint8Array bytes
   * directly (no Blob conversion).
   */
  onChunk?: (chunk: LumaJpegChunk) => void | Promise<void>
}

export type LumaJpegNodeEncoder = {
  writeRows: (rows: Uint8Array, rowCount: number) => Promise<void>
  /** Resolves with the full JPEG byte stream (or empty in chunks mode). */
  finish: () => Promise<Uint8Array>
  abort: () => void
}

export type LumaJpegNodeRuntime = {
  createEncoder: (options: LumaJpegEncoderOptions) => LumaJpegNodeEncoder
  dispose: () => void
}

const defaultNativeLoader: LumaJpegNodeNativeLoader = () =>
  loadNativeModuleForNode({ kind: 'jpeg' })

function makeRequestId(counter: { value: number }): string {
  counter.value += 1
  return `jpeg-node-${counter.value}`
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

export async function createLumaJpegRuntimeForNode(
  options: LumaJpegNodeRuntimeOptions = {},
): Promise<LumaJpegNodeRuntime> {
  const nativeLoader = options.nativeLoader ?? defaultNativeLoader

  const encoderFactoryLoader: InternalJpegEncoderFactoryLoader = async () => {
    const nativeModule = await nativeLoader()
    return createNativeJpegEncoderFactory(
      nativeModule as Parameters<typeof createNativeJpegEncoderFactory>[0],
    )
  }

  let disposed = false
  let encoderActive = false
  const counter = { value: 0 }
  const chunkQueue: Array<Promise<void>> = []

  const core = createJpegRuntimeCore(encoderFactoryLoader, {
    onResponse: async (response) => {
      if (!response.ok) return
      if (response.type !== 'chunk') return
      if (!options.onChunk) return
      const task = Promise.resolve(options.onChunk(response.payload))
      chunkQueue.push(task)
      try {
        await task
      } catch {
        // swallowed; the awaiter on chunkQueue will surface it
      }
    },
  })

  function assertLive(): void {
    if (disposed) {
      throw new Error('LUMA_JPEG_RUNTIME_DISPOSED')
    }
  }

  async function dispatch(
    type: JpegWorkerRequest['type'],
    payload: JpegWorkerRequest['payload'],
  ): Promise<JpegWorkerResponse> {
    const request = {
      id: makeRequestId(counter),
      type,
      payload,
    } as JpegWorkerRequest
    const response = await core.handleRequest(request)
    if (!response.ok) {
      throw new Error('LUMA_JPEG_RUNTIME_UNEXPECTED_FAILURE')
    }
    return response
  }

  async function drainChunkQueue(): Promise<void> {
    const inFlight = [...chunkQueue]
    chunkQueue.length = 0
    await Promise.all(inFlight)
  }

  function createEncoder(
    encoderOptions: LumaJpegEncoderOptions,
  ): LumaJpegNodeEncoder {
    assertLive()
    if (encoderActive) {
      throw new Error('LUMA_JPEG_RUNTIME_ENCODER_ACTIVE')
    }
    encoderActive = true

    let state: 'open' | 'finished' | 'aborted' = 'open'
    const createPromise = dispatch('create', encoderOptions).catch((error) => {
      state = 'aborted'
      encoderActive = false
      throw error
    })

    function assertOpen(): void {
      if (state === 'finished') {
        throw new Error('LUMA_JPEG_RUNTIME_FINISHED')
      }
      if (state === 'aborted') {
        throw new Error('LUMA_JPEG_RUNTIME_ABORTED')
      }
    }

    return {
      async writeRows(rows: Uint8Array, rowCount: number) {
        assertOpen()
        await createPromise
        assertOpen()
        await dispatch('rows', { rows, rowCount })
      },

      async finish() {
        assertOpen()
        await createPromise
        assertOpen()
        const response = await dispatch('finish', {})
        if (response.type !== 'finish') {
          throw new Error('LUMA_JPEG_RUNTIME_UNEXPECTED_RESPONSE')
        }
        await drainChunkQueue()
        state = 'finished'
        encoderActive = false
        return blobToUint8Array(response.payload.blob)
      },

      abort() {
        if (state !== 'open') return
        state = 'aborted'
        void createPromise
          .then(() => dispatch('abort', {}))
          .catch(() => undefined)
          .finally(() => {
            encoderActive = false
          })
      },
    }
  }

  return {
    createEncoder,
    dispose() {
      disposed = true
    },
  }
}
