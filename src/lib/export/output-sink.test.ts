import {
  createBlobOutputResult,
  createMemoryFileBackedOutputResult,
  materializeOutputBlob,
} from './output-sink'

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
})
