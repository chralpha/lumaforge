import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createBlobOutputResult,
  createMemoryFileBackedOutputResult,
  materializeOutputBlob,
} from '~/lib/export/output-sink'

import type { ExportCopyCapability } from '../../model/export-result'
import { createCompletedExportResult } from './export-result-materialization'

const jpegMetadataMock = vi.hoisted(() => ({
  preserveJpegMetadata: vi.fn(
    async ({ jpeg }: { jpeg: Blob }) =>
      new Blob(['metadata'], { type: jpeg.type || 'image/jpeg' }),
  ),
}))

vi.mock('~/lib/export/jpeg-metadata', () => ({
  preserveJpegMetadata: jpegMetadataMock.preserveJpegMetadata,
}))

const fullResolutionCopy: ExportCopyCapability = {
  mode: 'full-resolution',
  label: 'Copy full-resolution image',
}

describe('export result materialization', () => {
  beforeEach(() => {
    jpegMetadataMock.preserveJpegMetadata.mockClear()
  })

  it('wraps legacy blob worker output as the completed export result', async () => {
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' })

    const result = createCompletedExportResult({
      jobResult: {
        filename: 'frame_neutral_fullres.jpg',
        blob,
      },
      metadata: { make: 'Sony' },
      width: 6048,
      height: 4024,
      copyCapability: fullResolutionCopy,
      now: () => 123,
    })

    expect(result).toMatchObject({
      filename: 'frame_neutral_fullres.jpg',
      width: 6048,
      height: 4024,
      size: blob.size,
      createdAt: 123,
      copyCapability: fullResolutionCopy,
    })
    expect(result.output.kind).toBe('blob')
    await expect(materializeOutputBlob(result.output)).resolves.toBe(blob)
    expect(jpegMetadataMock.preserveJpegMetadata).not.toHaveBeenCalled()
  })

  it('prefers explicit worker output while keeping the job filename', async () => {
    const outputBlob = new Blob(['output'], { type: 'image/jpeg' })
    const legacyBlob = new Blob(['legacy'], { type: 'image/jpeg' })
    const output = createBlobOutputResult({
      filename: 'worker-output.jpg',
      blob: outputBlob,
    })

    const result = createCompletedExportResult({
      jobResult: {
        filename: 'requested-name.jpg',
        output,
        blob: legacyBlob,
      },
      metadata: null,
      width: 4000,
      height: 3000,
      copyCapability: fullResolutionCopy,
      now: () => 456,
    })

    expect(result.filename).toBe('requested-name.jpg')
    expect(result.output).toBe(output)
    expect(result.size).toBe(outputBlob.size)
    await expect(materializeOutputBlob(result.output)).resolves.toBe(outputBlob)
  })

  it('defers JPEG metadata preservation until file-backed output is opened', async () => {
    const metadata = { make: 'Sony', model: 'A7R' }
    const output = createMemoryFileBackedOutputResult({
      exportId: 'export-123',
      filename: 'file-backed.jpg',
      mimeType: 'image/jpeg',
      bytes: new TextEncoder().encode('jpeg'),
    })
    const originalOpenBlob = vi.spyOn(output, 'openBlob')

    const result = createCompletedExportResult({
      jobResult: {
        filename: 'frame_with_metadata.jpg',
        output,
      },
      metadata,
      width: 6048,
      height: 4024,
      copyCapability: fullResolutionCopy,
      now: () => 789,
    })

    expect(result.output.kind).toBe('file-backed')
    expect(originalOpenBlob).not.toHaveBeenCalled()
    expect(jpegMetadataMock.preserveJpegMetadata).not.toHaveBeenCalled()

    const materialized = await materializeOutputBlob(result.output)

    expect(originalOpenBlob).toHaveBeenCalledTimes(1)
    expect(jpegMetadataMock.preserveJpegMetadata).toHaveBeenCalledWith({
      jpeg: expect.any(Blob),
      metadata,
      width: 6048,
      height: 4024,
    })
    expect(materialized).toBeInstanceOf(Blob)
    expect(materialized.size).toBe(8)
    expect(materialized.type).toBe('image/jpeg')
  })

  it('throws the existing missing-output error when no output can be materialized', () => {
    expect(() =>
      createCompletedExportResult({
        jobResult: { filename: 'missing-output.jpg' },
        metadata: null,
        width: 6048,
        height: 4024,
        copyCapability: fullResolutionCopy,
        now: () => 123,
      }),
    ).toThrow('EXPORT_OUTPUT_MISSING')
  })
})
