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
  blob: Blob
  file: File
  filename: string
  width: number
  height: number
  size: number
  createdAt: number
  copyCapability: ExportCopyCapability
}

export function createExportResult({
  blob,
  filename,
  width,
  height,
  now = () => Date.now(),
  copyCapability,
}: {
  blob: Blob
  filename: string
  width: number
  height: number
  now?: () => number
  copyCapability: ExportCopyCapability
}): ExportResult {
  const createdAt = now()
  const type = blob.type || 'image/jpeg'
  const file = new File([blob], filename, {
    type,
    lastModified: createdAt,
  })

  return {
    blob,
    file,
    filename,
    width,
    height,
    size: blob.size,
    createdAt,
    copyCapability,
  }
}
