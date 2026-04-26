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

export function createLumaJpegRuntime(): LumaJpegRuntime {
  throw new Error('JPEG_RUNTIME_UNAVAILABLE')
}
