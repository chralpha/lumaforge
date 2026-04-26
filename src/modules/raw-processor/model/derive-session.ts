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
    session.exportState.fullResCapability.status === 'supported' &&
    session.renderState.status !== 'failed' &&
    session.exportState.status !== 'exporting'
  )
}

export function deriveExportDisabledReason(
  session: ImageSession,
): string | undefined {
  if (session.exportState.status === 'exporting') {
    return 'Full-resolution export is already running.'
  }

  if (session.renderState.status === 'failed') {
    return 'Resolve the current render error before exporting.'
  }

  switch (session.exportState.fullResCapability.status) {
    case 'unknown':
      return 'Full-resolution export support has not been checked yet.'
    case 'probing':
      return 'Checking full-resolution export support for this RAW file.'
    case 'unsupported':
      return session.exportState.fullResCapability.reason
    case 'supported':
      return undefined
  }
}
