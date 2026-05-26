import type { JpegExportMetadata } from '~/lib/export/jpeg-metadata'
import { preserveJpegMetadata } from '~/lib/export/jpeg-metadata'
import type { ExportOutputResult } from '~/lib/export/output-sink'
import { createBlobOutputResult } from '~/lib/export/output-sink'

import type {
  ExportCopyCapability,
  ExportResultKind,
} from '../model/export-result'
import { createExportResult } from '../model/export-result'

export type CompletedExportJobResult = {
  filename: string
  output?: ExportOutputResult
  blob?: Blob
}

function withLazyJpegMetadata(input: {
  output: ExportOutputResult
  metadata: unknown
  width: number
  height: number
}): ExportOutputResult {
  if (input.output.kind !== 'file-backed') {
    return input.output
  }

  const output = input.output
  return {
    ...output,
    async openBlob() {
      return preserveJpegMetadata({
        jpeg: await output.openBlob(),
        metadata: input.metadata as JpegExportMetadata | null | undefined,
        width: input.width,
        height: input.height,
      })
    },
  }
}

export function createCompletedExportResult({
  jobResult,
  kind,
  metadata,
  width,
  height,
  copyCapability,
  now,
}: {
  jobResult: CompletedExportJobResult
  kind?: ExportResultKind
  metadata: unknown
  width: number
  height: number
  copyCapability: ExportCopyCapability
  now?: () => number
}) {
  const output =
    jobResult.output ??
    (jobResult.blob
      ? createBlobOutputResult({
          filename: jobResult.filename,
          blob: jobResult.blob,
        })
      : undefined)

  if (!output) {
    throw new Error('EXPORT_OUTPUT_MISSING')
  }

  return createExportResult({
    output: withLazyJpegMetadata({
      output,
      metadata,
      width,
      height,
    }),
    kind,
    filename: jobResult.filename,
    width,
    height,
    now,
    copyCapability,
  })
}
