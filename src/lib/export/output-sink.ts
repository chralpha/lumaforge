export type BlobOutputResult = {
  kind: 'blob'
  filename: string
  blob: Blob
  byteLength: number
  mimeType: string
}

export type FileBackedOutputResult = {
  kind: 'file-backed'
  exportId: string
  filename: string
  byteLength: number
  mimeType: string
  openBlob: () => Promise<Blob>
  cleanup?: () => Promise<void>
}

export type ExportOutputResult = BlobOutputResult | FileBackedOutputResult

export function createBlobOutputResult(input: {
  filename: string
  blob: Blob
}): BlobOutputResult {
  return {
    kind: 'blob',
    filename: input.filename,
    blob: input.blob,
    byteLength: input.blob.size,
    mimeType: input.blob.type || 'image/jpeg',
  }
}

export function createMemoryFileBackedOutputResult(input: {
  exportId: string
  filename: string
  mimeType: string
  bytes: Uint8Array
}): FileBackedOutputResult {
  const bytes = new Uint8Array(input.bytes)
  const openBlob = async () => {
    const byteBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    const blob = new Blob([byteBuffer], { type: input.mimeType })
    if (typeof blob.arrayBuffer !== 'function') {
      Object.defineProperty(blob, 'arrayBuffer', {
        value: async () => byteBuffer.slice(0),
      })
    }
    return blob
  }

  return {
    kind: 'file-backed',
    exportId: input.exportId,
    filename: input.filename,
    byteLength: bytes.byteLength,
    mimeType: input.mimeType,
    openBlob,
  }
}

export async function materializeOutputBlob(result: ExportOutputResult) {
  if (result.kind === 'blob') return result.blob
  return result.openBlob()
}
