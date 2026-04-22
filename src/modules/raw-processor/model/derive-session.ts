import type { ImageSession, PreviewBundle } from './session'

export function selectDisplaySource(
  preview: PreviewBundle,
): 'embedded' | 'quick' | 'hq' | 'none' {
  if (preview.hqImage.status === 'ready') return 'hq'
  if (preview.quickDecodePreview.status === 'ready') return 'quick'
  if (preview.embeddedPreview.status === 'ready') return 'embedded'
  return 'none'
}

export function deriveCanEdit(session: ImageSession): boolean {
  return selectDisplaySource(session.previewBundle) !== 'none'
}

export function deriveCanExport(session: ImageSession): boolean {
  return (
    session.previewBundle.hqImage.status === 'ready' &&
    session.renderState.status !== 'failed' &&
    session.exportState.status !== 'exporting'
  )
}
