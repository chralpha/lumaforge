import { LumaRawRuntimeError } from './errors'
import type {
  LumaEmbeddedPreview,
  LumaRawFrame,
  LumaRawProbe,
  LumaRawRuntime,
  LumaRawRuntimeInfo,
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

  if (typeof file.arrayBuffer === 'function') {
    return readFileBytesWithArrayBuffer(file, signal)
  }

  return readFileBytesWithReader(file, signal)
}

function readFileBytesWithArrayBuffer(
  file: File,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const fileBufferPromise = file.arrayBuffer()

  if (!signal) {
    return fileBufferPromise
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(createJobCancelledError())
    }

    signal.addEventListener('abort', onAbort, { once: true })

    fileBufferPromise.then(
      (fileBuffer) => {
        signal.removeEventListener('abort', onAbort)
        resolve(fileBuffer)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

function readFileBytesWithReader(
  file: File,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      reader.abort()
      cleanup()
      reject(createJobCancelledError())
    }

    reader.onload = () => {
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

  return {
    async init(): Promise<LumaRawRuntimeInfo> {
      assertCrossOriginIsolation(requireCrossOriginIsolation)
      return client.request('init', { requireCrossOriginIsolation })
    },

    async probe(file: File, signal?: AbortSignal): Promise<LumaRawProbe> {
      const { fileBuffer, readFile } = await readFileBuffer(file, signal)
      const probe = await client.request(
        'probe',
        createFilePayload(file, fileBuffer),
        [fileBuffer],
        signal,
      )

      return mergeReadTimings(probe, readFile)
    },

    async extractEmbeddedPreview(
      file: File,
      signal?: AbortSignal,
    ): Promise<LumaEmbeddedPreview | null> {
      const { fileBuffer, readFile } = await readFileBuffer(file, signal)
      const preview = await client.request(
        'extractEmbeddedPreview',
        createFilePayload(file, fileBuffer),
        [fileBuffer],
        signal,
      )

      if (!preview) return null

      return mergeReadTimings(preview, readFile)
    },

    async decodeQuick(file: File, signal?: AbortSignal): Promise<LumaRawFrame> {
      const { fileBuffer, readFile } = await readFileBuffer(file, signal)
      const frame = await client.request(
        'decodeQuick',
        createFilePayload(file, fileBuffer),
        [fileBuffer],
        signal,
      )

      return mergeReadTimings(frame, readFile)
    },

    async decodeHq(file: File, signal?: AbortSignal): Promise<LumaRawFrame> {
      const { fileBuffer, readFile } = await readFileBuffer(file, signal)
      const frame = await client.request(
        'decodeHq',
        createFilePayload(file, fileBuffer),
        [fileBuffer],
        signal,
      )

      return mergeReadTimings(frame, readFile)
    },

    dispose() {
      client.dispose()
    },
  }
}
