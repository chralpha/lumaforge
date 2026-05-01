import type { ExportOutputResult } from '~/lib/export/output-sink'

export type ExportCopyCapability =
  | { mode: 'full-resolution'; label: 'Copy full-resolution image' }
  | {
      mode: 'preview-size'
      label: 'Copy preview-size image'
      reason: string
    }
  | { mode: 'unavailable'; reason: string }

export type ExportShareCapability =
  | { available: true }
  | { available: false; reason: string }

export type ExportResult = {
  output: ExportOutputResult
  filename: string
  width: number
  height: number
  size: number
  createdAt: number
  copyCapability: ExportCopyCapability
}

export function createExportResult({
  output,
  filename = output.filename,
  width,
  height,
  now = () => Date.now(),
  copyCapability,
}: {
  output: ExportOutputResult
  filename?: string
  width: number
  height: number
  now?: () => number
  copyCapability: ExportCopyCapability
}): ExportResult {
  const createdAt = now()

  return {
    output,
    filename,
    width,
    height,
    size: output.byteLength,
    createdAt,
    copyCapability,
  }
}
