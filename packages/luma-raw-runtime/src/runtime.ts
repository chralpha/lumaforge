import { LumaRawRuntimeError } from './errors'
import type {
  LumaEmbeddedPreview,
  LumaRawFrame,
  LumaRawProbe,
  LumaRawRuntime,
  LumaRawRuntimeInfo,
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

async function readFileBuffer(file: File) {
  const start = performance.now()
  const fileBuffer =
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result
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
            reject(
              reader.error ??
                new LumaRawRuntimeError(
                  'RAW_WORKER_PROTOCOL_ERROR',
                  'RAW runtime failed to read file bytes.',
                ),
            )
          }
          reader.readAsArrayBuffer(file)
        })
  return {
    fileBuffer,
    readFile: performance.now() - start,
  }
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
      const { fileBuffer, readFile } = await readFileBuffer(file)
      const probe = await client.request(
        'probe',
        {
          fileBuffer,
          fileName: file.name,
          fileSize: file.size,
        },
        [fileBuffer],
        signal,
      )

      return {
        ...probe,
        timings: {
          ...probe.timings,
          readFile,
          total: probe.timings.total + readFile,
        },
      }
    },

    async extractEmbeddedPreview(
      file: File,
      signal?: AbortSignal,
    ): Promise<LumaEmbeddedPreview | null> {
      const { fileBuffer, readFile } = await readFileBuffer(file)
      const preview = await client.request(
        'extractEmbeddedPreview',
        {
          fileBuffer,
          fileName: file.name,
          fileSize: file.size,
        },
        [fileBuffer],
        signal,
      )

      if (!preview) return null

      return {
        ...preview,
        timings: {
          ...preview.timings,
          readFile,
          total: preview.timings.total + readFile,
        },
      }
    },

    async decodeQuick(file: File, signal?: AbortSignal): Promise<LumaRawFrame> {
      const { fileBuffer, readFile } = await readFileBuffer(file)
      const frame = await client.request(
        'decodeQuick',
        {
          fileBuffer,
          fileName: file.name,
          fileSize: file.size,
        },
        [fileBuffer],
        signal,
      )

      return {
        ...frame,
        timings: {
          ...frame.timings,
          readFile,
          total: frame.timings.total + readFile,
        },
      }
    },

    async decodeHq(file: File, signal?: AbortSignal): Promise<LumaRawFrame> {
      const { fileBuffer, readFile } = await readFileBuffer(file)
      const frame = await client.request(
        'decodeHq',
        {
          fileBuffer,
          fileName: file.name,
          fileSize: file.size,
        },
        [fileBuffer],
        signal,
      )

      return {
        ...frame,
        timings: {
          ...frame.timings,
          readFile,
          total: frame.timings.total + readFile,
        },
      }
    },

    dispose() {
      client.dispose()
    },
  }
}
