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

const defaultWorkerFactory = () =>
  new Worker(new URL('../worker/runtime.worker.ts', import.meta.url), {
    type: 'module',
  })

export function createLumaJpegRuntime(
  options: LumaJpegRuntimeOptions = {},
): LumaJpegRuntime {
  void (options.workerFactory ?? defaultWorkerFactory)
  throw new Error('JPEG_RUNTIME_UNAVAILABLE')
}
