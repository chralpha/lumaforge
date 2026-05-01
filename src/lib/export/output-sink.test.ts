import {
  createBlobOutputResult,
  createMemoryFileBackedOutputResult,
  createOpfsFileBackedOutputResult,
  createOpfsOutputWritable,
  materializeOutputBlob,
} from './output-sink'

function createMemoryOpfsStorage() {
  const files = new Map<string, Blob>()

  function createDirectory(path: string): FileSystemDirectoryHandle {
    return {
      kind: 'directory',
      name: path.split('/').at(-1) ?? '',
      async getDirectoryHandle(name: string) {
        return createDirectory(`${path}/${name}`)
      },
      async getFileHandle(name: string) {
        const filePath = `${path}/${name}`
        return {
          kind: 'file',
          name,
          async createWritable() {
            const chunks: BlobPart[] = []
            return {
              async write(chunk: BlobPart) {
                chunks.push(chunk)
              },
              async close() {
                files.set(filePath, new Blob(chunks, { type: 'image/jpeg' }))
              },
            } as FileSystemWritableFileStream
          },
          async getFile() {
            return (
              files.get(filePath) ?? new File([], name, { type: 'image/jpeg' })
            )
          },
        } as FileSystemFileHandle
      },
      async removeEntry(name: string) {
        files.delete(`${path}/${name}`)
      },
    } as FileSystemDirectoryHandle
  }

  return {
    storage: {
      getDirectory: async () => createDirectory(''),
    } as Pick<StorageManager, 'getDirectory'>,
    files,
  }
}

describe('export output sink', () => {
  it('materializes file-backed output only at handoff and protects copied bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const result = createMemoryFileBackedOutputResult({
      exportId: 'export-1',
      filename: 'frame.jpg',
      mimeType: 'image/jpeg',
      bytes,
    })

    bytes[0] = 9

    expect(result.kind).toBe('file-backed')
    expect(result.exportId).toBe('export-1')
    expect(result.filename).toBe('frame.jpg')
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.byteLength).toBe(3)

    const blob = await materializeOutputBlob(result)

    expect(blob.type).toBe('image/jpeg')
    expect(blob.size).toBe(3)
    await expect(blob.arrayBuffer()).resolves.toEqual(
      new Uint8Array([1, 2, 3]).buffer,
    )
  })

  it('keeps Blob-backed output explicit for non-ios handoff', async () => {
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' })
    const result = createBlobOutputResult({ blob, filename: 'frame.jpg' })

    expect(result).toMatchObject({
      kind: 'blob',
      filename: 'frame.jpg',
      byteLength: 4,
      mimeType: 'image/jpeg',
    })
    await expect(materializeOutputBlob(result)).resolves.toBe(blob)
  })

  it('opens and cleans up OPFS-backed output lazily', async () => {
    const { storage, files } = createMemoryOpfsStorage()
    const writable = await createOpfsOutputWritable({
      exportId: 'export-opfs',
      storage,
    })
    await writable.write(new Uint8Array([1, 2, 3]))
    await writable.close()

    const result = createOpfsFileBackedOutputResult({
      exportId: 'export-opfs',
      filename: 'frame.jpg',
      byteLength: 3,
      mimeType: 'image/jpeg',
      storage,
    })

    expect(result.kind).toBe('file-backed')
    expect(result.byteLength).toBe(3)
    await expect(materializeOutputBlob(result)).resolves.toMatchObject({
      type: 'image/jpeg',
      size: 3,
    })

    await result.cleanup?.()
    expect(files.size).toBe(0)
  })
})
