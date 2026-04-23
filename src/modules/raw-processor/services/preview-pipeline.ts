export type EmbeddedPreviewPayload = {
  width: number
  height: number
  data: Uint8Array
  mimeType: string
  timings?: Record<string, number | undefined>
}

export type PreviewEvent =
  | ({ type: 'embedded-ready' } & EmbeddedPreviewPayload)
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
  runtimeSession,
  onEvent,
}: {
  runtimeSession: {
    extractEmbeddedPreview: () => Promise<EmbeddedPreviewPayload | null>
    decodeQuickRaw: () => Promise<{ width: number; height: number }>
    decodeHqRaw: () => Promise<{ width: number; height: number }>
  }
  onEvent: (event: PreviewEvent) => void
}) {
  let embedded: EmbeddedPreviewPayload | null = null
  try {
    embedded = await runtimeSession.extractEmbeddedPreview()
  } catch {
    embedded = null
  }

  if (embedded) {
    onEvent({ type: 'embedded-ready', ...embedded })
  }

  const quick = await runtimeSession.decodeQuickRaw()
  onEvent({ type: 'quick-ready', ...quick })
  await yieldToPreviewPaint()

  try {
    const hq = await runtimeSession.decodeHqRaw()
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
