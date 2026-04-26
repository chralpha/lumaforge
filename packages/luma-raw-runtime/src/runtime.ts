import { LumaRawRuntimeError } from './errors'
import type {
  LumaEmbeddedPreview,
  LumaRawDecodeSession,
  LumaRawExportCapability,
  LumaRawFrame,
  LumaRawProbe,
  LumaRawQuickOptions,
  LumaRawRuntime,
  LumaRawRuntimeInfo,
  LumaRawSessionInfo,
  LumaRawTimings,
} from './types'
import { LumaRawWorkerClient } from './worker-client'

export type LumaRawRuntimeOptions = {
  requireCrossOriginIsolation?: boolean
  workerFactory?: () => Worker
}

const defaultWorkerFactory = () =>
  new Worker(new URL('../worker/runtime.worker.ts', import.meta.url), {
    type: 'module',
  })

function createJobCancelledError() {
  return new LumaRawRuntimeError(
    'RAW_JOB_CANCELLED',
    'RAW runtime job was cancelled.',
  )
}

function mergeReadTimings<T extends { timings: LumaRawTimings }>(
  result: T,
  readFile: number,
): T {
  return {
    ...result,
    timings: {
      ...result.timings,
      readFile,
      total: result.timings.total + readFile,
    },
  }
}

function mergeSessionReadTimings(
  sessionInfo: LumaRawSessionInfo,
  readFile: number,
): LumaRawSessionInfo {
  return {
    ...sessionInfo,
    probe: mergeReadTimings(sessionInfo.probe, readFile),
    timings: {
      ...sessionInfo.timings,
      readFile,
      total: sessionInfo.timings.total + readFile,
    },
  }
}

function mergeSessionStageTimings<T extends { timings: LumaRawTimings }>(
  result: T,
  sessionInfo: LumaRawSessionInfo,
): T {
  return {
    ...result,
    timings: {
      ...sessionInfo.timings,
      ...result.timings,
      readFile: sessionInfo.timings.readFile,
      total: sessionInfo.timings.total + result.timings.total,
    },
  }
}

function createFilePayload(file: File, fileBuffer: ArrayBuffer) {
  return {
    fileBuffer,
    fileName: file.name,
    fileSize: file.size,
  }
}

async function readFileBuffer(file: File, signal?: AbortSignal) {
  const start = performance.now()
  const fileBuffer = await readFileBytes(file, signal)
  return {
    fileBuffer,
    readFile: performance.now() - start,
  }
}

function readFileBytes(file: File, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (signal?.aborted) {
    return Promise.reject(createJobCancelledError())
  }

  if (signal) {
    return readFileBytesWithReader(file, signal)
  }

  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer()
  }

  return readFileBytesWithReader(file)
}

function readFileBytesWithReader(file: File, signal?: AbortSignal) {
  if (typeof FileReader === 'undefined') {
    return Promise.reject(
      new LumaRawRuntimeError(
        'RAW_WORKER_PROTOCOL_ERROR',
        'RAW runtime failed to read file bytes.',
      ),
    )
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    let settled = false

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      reader.abort()
      reject(createJobCancelledError())
    }

    reader.onload = () => {
      if (settled) return
      settled = true
      const result = reader.result
      cleanup()

      if (result instanceof ArrayBuffer) {
        resolve(result)
        return
      }

      reject(
        new LumaRawRuntimeError(
          'RAW_WORKER_PROTOCOL_ERROR',
          'RAW runtime failed to read file bytes.',
        ),
      )
    }

    reader.onerror = () => {
      cleanup()
      reject(
        reader.error ??
          new LumaRawRuntimeError(
            'RAW_WORKER_PROTOCOL_ERROR',
            'RAW runtime failed to read file bytes.',
          ),
      )
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    reader.readAsArrayBuffer(file)
  })
}

function assertCrossOriginIsolation(required: boolean) {
  if (!required) return

  const isolated =
    typeof globalThis.crossOriginIsolated === 'boolean'
      ? globalThis.crossOriginIsolated
      : false

  if (!isolated) {
    throw new LumaRawRuntimeError(
      'RAW_CROSS_ORIGIN_ISOLATION_REQUIRED',
      'Cross-origin isolation is required for pthread RAW decode.',
    )
  }
}

export function createLumaRawRuntime(
  options: LumaRawRuntimeOptions = {},
): LumaRawRuntime {
  const requireCrossOriginIsolation =
    options.requireCrossOriginIsolation ?? true
  const client = new LumaRawWorkerClient(
    options.workerFactory ?? defaultWorkerFactory,
  )

  async function openSession(
    file: File,
    options: LumaRawQuickOptions = {},
    signal?: AbortSignal,
  ): Promise<LumaRawDecodeSession> {
    const { fileBuffer, readFile } = await readFileBuffer(file, signal)
    const sessionInfo = mergeSessionReadTimings(
      await client.request(
        'openSession',
        {
          ...createFilePayload(file, fileBuffer),
          maxOutputPixels: options.maxOutputPixels,
        },
        [fileBuffer],
        signal,
      ),
      readFile,
    )

    let disposed = false
    const closeSession = () => {
      if (disposed) return
      disposed = true
      void client
        .request('closeSession', { sessionId: sessionInfo.sessionId })
        .catch(() => undefined)
    }

    return {
      ...sessionInfo,
      extractEmbeddedPreview(stageSignal?: AbortSignal) {
        return client.request(
          'extractEmbeddedPreviewFromSession',
          { sessionId: sessionInfo.sessionId },
          [],
          stageSignal,
        )
      },
      probeExportCapability(
        stageSignal?: AbortSignal,
      ): Promise<LumaRawExportCapability> {
        return client.request(
          'probeExportCapabilityFromSession',
          { sessionId: sessionInfo.sessionId },
          [],
          stageSignal,
        )
      },
      readRawWindow(rect, stageSignal?: AbortSignal) {
        return client.request(
          'readRawWindowFromSession',
          { sessionId: sessionInfo.sessionId, rect },
          [],
          stageSignal,
        )
      },
      readProcessedWindow(request, stageSignal?: AbortSignal) {
        return client.request(
          'readProcessedWindowFromSession',
          { sessionId: sessionInfo.sessionId, request },
          [],
          stageSignal,
        )
      },
      decodeQuick(
        stageOptions: LumaRawQuickOptions = options,
        stageSignal?: AbortSignal,
      ) {
        return client.request(
          'decodeQuickFromSession',
          {
            sessionId: sessionInfo.sessionId,
            maxOutputPixels: stageOptions.maxOutputPixels,
          },
          [],
          stageSignal,
        )
      },
      decodeHq(stageSignal?: AbortSignal) {
        return client.request(
          'decodeHqFromSession',
          { sessionId: sessionInfo.sessionId },
          [],
          stageSignal,
        )
      },
      dispose: closeSession,
    }
  }

  return {
    async init(): Promise<LumaRawRuntimeInfo> {
      assertCrossOriginIsolation(requireCrossOriginIsolation)
      return client.request('init', { requireCrossOriginIsolation })
    },

    openSession,

    async probe(file: File, signal?: AbortSignal): Promise<LumaRawProbe> {
      const session = await openSession(file, {}, signal)
      try {
        return session.probe
      } finally {
        session.dispose()
      }
    },

    async extractEmbeddedPreview(
      file: File,
      signal?: AbortSignal,
    ): Promise<LumaEmbeddedPreview | null> {
      const session = await openSession(file, {}, signal)
      try {
        const preview = await session.extractEmbeddedPreview(signal)
        return preview ? mergeSessionStageTimings(preview, session) : null
      } finally {
        session.dispose()
      }
    },

    async decodeQuick(file: File, signal?: AbortSignal): Promise<LumaRawFrame> {
      const session = await openSession(file, {}, signal)
      try {
        return mergeSessionStageTimings(
          await session.decodeQuick(undefined, signal),
          session,
        )
      } finally {
        session.dispose()
      }
    },

    async decodeHq(file: File, signal?: AbortSignal): Promise<LumaRawFrame> {
      const session = await openSession(file, {}, signal)
      try {
        return mergeSessionStageTimings(await session.decodeHq(signal), session)
      } finally {
        session.dispose()
      }
    },

    dispose() {
      client.dispose()
    },
  }
}
