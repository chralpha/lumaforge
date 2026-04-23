export type PreviewEvent =
  | { type: 'embedded-ready'; width: number; height: number }
  | { type: 'quick-ready'; width: number; height: number }
  | { type: 'hq-ready'; width: number; height: number }
  | { type: 'hq-failed'; errorCode: string }

function toPreviewErrorCode(error: unknown, fallbackCode: string) {
  if (typeof error === 'object' && error && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') return code
  }

  return fallbackCode
}

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

  const quick = await decodeQuickPreview(file)
  onEvent({ type: 'quick-ready', ...quick })
  await yieldToPreviewPaint()

  try {
    const hq = await decodeHqPreview(file)
    onEvent({ type: 'hq-ready', ...hq })
  } catch (error) {
    onEvent({
      type: 'hq-failed',
      errorCode: toPreviewErrorCode(error, 'RAW_HQ_DECODE_FAILED'),
    })
  }
}

export async function extractEmbeddedPreviewBestEffort() {
  return null
}

function yieldToPreviewPaint() {
  if (
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function'
  ) {
    return new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.setTimeout(resolve, 0)
      })
    })
  }

  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}
