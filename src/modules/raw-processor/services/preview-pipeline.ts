export type PreviewEvent =
  | { type: 'embedded-ready'; width: number; height: number }
  | { type: 'quick-ready'; width: number; height: number }
  | { type: 'hq-ready'; width: number; height: number }
  | { type: 'hq-failed'; errorCode: string }

export async function runPreviewPipeline({
  file,
  extractEmbeddedPreview,
  decodeQuickPreview,
  decodeHqPreview,
  onEvent,
}: {
  file: File
  extractEmbeddedPreview: (
    file: File,
  ) => Promise<{ width: number; height: number } | null>
  decodeQuickPreview: (file: File) => Promise<{ width: number; height: number }>
  decodeHqPreview: (file: File) => Promise<{ width: number; height: number }>
  onEvent: (event: PreviewEvent) => void
}) {
  const embedded = await extractEmbeddedPreview(file)
  if (embedded) {
    onEvent({ type: 'embedded-ready', ...embedded })
  }

  if (!embedded) {
    const quick = await decodeQuickPreview(file)
    onEvent({ type: 'quick-ready', ...quick })
  }

  try {
    const hq = await decodeHqPreview(file)
    onEvent({ type: 'hq-ready', ...hq })
  } catch {
    onEvent({ type: 'hq-failed', errorCode: 'RAW_HQ_DECODE_FAILED' })
  }
}

export async function extractEmbeddedPreviewBestEffort() {
  return null
}
