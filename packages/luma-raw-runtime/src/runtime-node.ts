import { loadNativeModuleForNode } from '@lumaforge/luma-native-artifacts/load-for-node'

import { createNativeFactory } from '../worker/native-adapter'
import type {LumaRawRuntimeCore} from '../worker/runtime-core';
import {
  createRuntimeCore
} from '../worker/runtime-core'
import { LumaRawRuntimeError } from './errors'
import type {
  LumaEmbeddedPreview,
  LumaRawBoundedHqOptions,
  LumaRawCameraCalibrationProfile,
  LumaRawDecodeSession,
  LumaRawExportCapability,
  LumaRawFrame,
  LumaRawProbe,
  LumaRawProcessedWindow,
  LumaRawProcessedWindowRequest,
  LumaRawQuickOptions,
  LumaRawRuntimeInfo,
  LumaRawRuntimeMemoryProfile,
  LumaRawWindow,
  LumaRawWindowRect,
} from './types'
import type {
  LumaRawWorkerPayloadByType,
  LumaRawWorkerRequest,
  LumaRawWorkerRequestPayloadByType,
  LumaRawWorkerRequestType,
} from './worker-protocol'

export type LumaRawNodeSourceInput = {
  data: Uint8Array
  name?: string
  size?: number
}

export type LumaRawNodeNativeLoader = (options: {
  memoryProfile: LumaRawRuntimeMemoryProfile
}) => Promise<unknown>

export type LumaRawNodeRuntimeOptions = {
  memoryProfile?: LumaRawRuntimeMemoryProfile
  /**
   * Override the default native module loader (tests, custom artifact paths).
   * Receives `{ memoryProfile }` and returns the Emscripten module instance,
   * matching the shape produced by
   * `@lumaforge/luma-native-artifacts/load-for-node`.
   */
  nativeLoader?: LumaRawNodeNativeLoader
}

export type LumaRawNodeRuntime = {
  init: () => Promise<LumaRawRuntimeInfo>
  probe: (
    input: LumaRawNodeSourceInput,
    signal?: AbortSignal,
  ) => Promise<LumaRawProbe>
  extractEmbeddedPreview: (
    input: LumaRawNodeSourceInput,
    signal?: AbortSignal,
  ) => Promise<LumaEmbeddedPreview | null>
  decodeQuick: (
    input: LumaRawNodeSourceInput,
    options?: LumaRawQuickOptions,
    signal?: AbortSignal,
  ) => Promise<LumaRawFrame>
  decodeBoundedHq: (
    input: LumaRawNodeSourceInput,
    options: LumaRawBoundedHqOptions,
    signal?: AbortSignal,
  ) => Promise<LumaRawFrame>
  openSession: (
    input: LumaRawNodeSourceInput,
    options?: LumaRawQuickOptions,
    signal?: AbortSignal,
  ) => Promise<LumaRawDecodeSession>
  dispose: () => void
}

const defaultNativeLoader: LumaRawNodeNativeLoader = ({ memoryProfile }) =>
  loadNativeModuleForNode({ kind: 'raw', memoryProfile })

function ensureNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new LumaRawRuntimeError(
      'RAW_JOB_CANCELLED',
      'RAW runtime job was cancelled.',
    )
  }
}

function toFileBuffer(data: Uint8Array): ArrayBuffer {
  if (
    data.byteOffset === 0 &&
    data.byteLength === data.buffer.byteLength &&
    data.buffer instanceof ArrayBuffer
  ) {
    return data.buffer
  }
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer
}

function buildFilePayload(input: LumaRawNodeSourceInput) {
  const { data, name = 'unnamed.raw', size = data.byteLength } = input
  return {
    fileBuffer: toFileBuffer(data),
    fileName: name,
    fileSize: size,
  }
}

function makeRequestId(counter: { value: number }): string {
  counter.value += 1
  return `raw-node-${counter.value}`
}

async function dispatch<T extends LumaRawWorkerRequestType>(
  core: LumaRawRuntimeCore,
  type: T,
  payload: LumaRawWorkerRequestPayloadByType[T],
  counter: { value: number },
  signal?: AbortSignal,
): Promise<LumaRawWorkerPayloadByType[T]> {
  ensureNotAborted(signal)
  const request = {
    id: makeRequestId(counter),
    type,
    payload,
  } as LumaRawWorkerRequest
  const response = await core.handleRequest(request)
  if (!response.ok) {
    throw new LumaRawRuntimeError(response.error.code, response.error.message)
  }
  return response.payload as LumaRawWorkerPayloadByType[T]
}

export async function createLumaRawRuntimeForNode(
  options: LumaRawNodeRuntimeOptions = {},
): Promise<LumaRawNodeRuntime> {
  const memoryProfile = options.memoryProfile ?? 'desktop'
  const nativeLoader = options.nativeLoader ?? defaultNativeLoader
  const nativeModule = await nativeLoader({ memoryProfile })
  const nativeFactory = createNativeFactory(
    nativeModule as Parameters<typeof createNativeFactory>[0],
  )
  const core = createRuntimeCore(nativeFactory, { memoryProfile })
  const counter = { value: 0 }
  let disposed = false

  function assertLive(): void {
    if (disposed) {
      throw new LumaRawRuntimeError(
        'RAW_RUNTIME_UNAVAILABLE',
        'RAW runtime has been disposed.',
      )
    }
  }

  async function openSession(
    input: LumaRawNodeSourceInput,
    quickOptions: LumaRawQuickOptions = {},
    signal?: AbortSignal,
  ): Promise<LumaRawDecodeSession> {
    assertLive()
    const sessionInfo = await dispatch(
      core,
      'openSession',
      {
        ...buildFilePayload(input),
        maxOutputPixels: quickOptions.maxOutputPixels,
      },
      counter,
      signal,
    )

    let sessionDisposed = false
    const dispose = () => {
      if (sessionDisposed) return
      sessionDisposed = true
      void dispatch(
        core,
        'closeSession',
        { sessionId: sessionInfo.sessionId },
        counter,
      ).catch(() => undefined)
    }

    return {
      ...sessionInfo,
      extractEmbeddedPreview(stageSignal?: AbortSignal) {
        return dispatch(
          core,
          'extractEmbeddedPreviewFromSession',
          { sessionId: sessionInfo.sessionId },
          counter,
          stageSignal,
        ) as Promise<LumaEmbeddedPreview | null>
      },
      probeExportCapability(stageSignal?: AbortSignal) {
        return dispatch(
          core,
          'probeExportCapabilityFromSession',
          { sessionId: sessionInfo.sessionId },
          counter,
          stageSignal,
        ) as Promise<LumaRawExportCapability>
      },
      beginProcessedWindowExport(stageSignal?: AbortSignal) {
        return dispatch(
          core,
          'beginProcessedWindowExportFromSession',
          { sessionId: sessionInfo.sessionId },
          counter,
          stageSignal,
        ) as Promise<{ active: true }>
      },
      endProcessedWindowExport(stageSignal?: AbortSignal) {
        return dispatch(
          core,
          'endProcessedWindowExportFromSession',
          { sessionId: sessionInfo.sessionId },
          counter,
          stageSignal,
        ) as Promise<{ ended: true }>
      },
      readRawWindow(rect: LumaRawWindowRect, stageSignal?: AbortSignal) {
        return dispatch(
          core,
          'readRawWindowFromSession',
          { sessionId: sessionInfo.sessionId, rect },
          counter,
          stageSignal,
        ) as Promise<LumaRawWindow>
      },
      readProcessedWindow(
        request: LumaRawProcessedWindowRequest,
        stageSignal?: AbortSignal,
      ) {
        return dispatch(
          core,
          'readProcessedWindowFromSession',
          { sessionId: sessionInfo.sessionId, request },
          counter,
          stageSignal,
        ) as Promise<LumaRawProcessedWindow>
      },
      applyCalibration(
        profile: LumaRawCameraCalibrationProfile,
        stageSignal?: AbortSignal,
      ) {
        return dispatch(
          core,
          'applyCalibrationToSession',
          {
            sessionId: sessionInfo.sessionId,
            cameraCalibration: profile,
          },
          counter,
          stageSignal,
        ) as Promise<{ applied: true }>
      },
      decodeQuick(
        stageOptions: LumaRawQuickOptions = quickOptions,
        stageSignal?: AbortSignal,
      ) {
        return dispatch(
          core,
          'decodeQuickFromSession',
          {
            sessionId: sessionInfo.sessionId,
            maxOutputPixels: stageOptions.maxOutputPixels,
          },
          counter,
          stageSignal,
        ) as Promise<LumaRawFrame>
      },
      decodeBoundedHq(
        stageOptions: LumaRawBoundedHqOptions,
        stageSignal?: AbortSignal,
      ) {
        return dispatch(
          core,
          'decodeBoundedHqFromSession',
          {
            sessionId: sessionInfo.sessionId,
            maxOutputPixels: stageOptions.maxOutputPixels,
          },
          counter,
          stageSignal,
        ) as Promise<LumaRawFrame>
      },
      dispose,
    }
  }

  return {
    async init() {
      assertLive()
      return dispatch(
        core,
        'init',
        { requireCrossOriginIsolation: false, memoryProfile },
        counter,
      )
    },

    openSession,

    async probe(input, signal) {
      const session = await openSession(input, {}, signal)
      try {
        return session.probe
      } finally {
        session.dispose()
      }
    },

    async extractEmbeddedPreview(input, signal) {
      const session = await openSession(input, {}, signal)
      try {
        return await session.extractEmbeddedPreview(signal)
      } finally {
        session.dispose()
      }
    },

    async decodeQuick(input, options, signal) {
      const session = await openSession(input, options, signal)
      try {
        return await session.decodeQuick(options, signal)
      } finally {
        session.dispose()
      }
    },

    async decodeBoundedHq(input, options, signal) {
      const session = await openSession(input, {}, signal)
      try {
        return await session.decodeBoundedHq(options, signal)
      } finally {
        session.dispose()
      }
    },

    dispose() {
      disposed = true
    },
  }
}
