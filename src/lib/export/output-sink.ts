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

type OpfsStorage = Pick<StorageManager, 'getDirectory'>

const OPFS_EXPORTS_DIR = '.lumaforge-exports'
const OPFS_ACTIVE_DIR = 'active'
const DEFAULT_OPFS_OUTPUT_FILE = 'output.jpg'

function getDefaultOpfsStorage(): OpfsStorage {
  const storage = globalThis.navigator?.storage
  if (!storage?.getDirectory) {
    throw new Error('OPFS_OUTPUT_STORAGE_UNAVAILABLE')
  }

  return storage
}

async function getOpfsExportDirectory(
  exportId: string,
  storage: OpfsStorage = getDefaultOpfsStorage(),
) {
  const root = await storage.getDirectory()
  const exportsDirectory = await root.getDirectoryHandle(OPFS_EXPORTS_DIR, {
    create: true,
  })
  const activeDirectory = await exportsDirectory.getDirectoryHandle(
    OPFS_ACTIVE_DIR,
    { create: true },
  )

  return activeDirectory.getDirectoryHandle(exportId, { create: true })
}

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

export async function createOpfsOutputWritable(input: {
  exportId: string
  outputFileName?: string
  storage?: OpfsStorage
}) {
  const exportDirectory = await getOpfsExportDirectory(
    input.exportId,
    input.storage,
  )
  const fileHandle = await exportDirectory.getFileHandle(
    input.outputFileName ?? DEFAULT_OPFS_OUTPUT_FILE,
    { create: true },
  )

  return fileHandle.createWritable()
}

export function createOpfsFileBackedOutputResult(input: {
  exportId: string
  filename: string
  byteLength: number
  mimeType: string
  outputFileName?: string
  storage?: OpfsStorage
}): FileBackedOutputResult {
  const outputFileName = input.outputFileName ?? DEFAULT_OPFS_OUTPUT_FILE

  return {
    kind: 'file-backed',
    exportId: input.exportId,
    filename: input.filename,
    byteLength: input.byteLength,
    mimeType: input.mimeType,
    async openBlob() {
      const exportDirectory = await getOpfsExportDirectory(
        input.exportId,
        input.storage,
      )
      const fileHandle = await exportDirectory.getFileHandle(outputFileName)
      const file = await fileHandle.getFile()
      const bytes = await file.arrayBuffer()
      const blob = new Blob([bytes], { type: input.mimeType })
      if (typeof blob.arrayBuffer !== 'function') {
        Object.defineProperty(blob, 'arrayBuffer', {
          value: async () => bytes.slice(0),
        })
      }
      return blob
    },
    async cleanup() {
      const exportDirectory = await getOpfsExportDirectory(
        input.exportId,
        input.storage,
      )
      await exportDirectory.removeEntry(outputFileName)
    },
  }
}

export async function materializeOutputBlob(result: ExportOutputResult) {
  if (result.kind === 'blob') return result.blob
  return result.openBlob()
}
