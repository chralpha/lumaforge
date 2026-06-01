import type { DecodedImage } from '~/lib/raw/decoder'

import { selectDisplaySource } from '../../model/derive-session'
import type { DisplaySource, ImageSession } from '../../model/session'
import { classifySupportLevel } from '../ingest/support-matrix'

type PreviewReadyPayload = {
  width: number
  height: number
  objectUrl?: string
  mimeType?: string
  timings?: Record<string, number | undefined>
}

export function applyPreviewLoadStarted(
  session: ImageSession,
  compareSplit: number,
): ImageSession {
  return {
    ...session,
    viewState: {
      ...session.viewState,
      mode: 'compare',
      compareSplit,
    },
    previewBundle: {
      ...session.previewBundle,
      quickDecodePreview: { status: 'loading' },
      boundedHqPreview: { status: 'loading' },
    },
    renderState: {
      status: 'preparing',
    },
    exportState: {
      ...session.exportState,
      fullResCapability: { status: 'probing' },
    },
  }
}

export function applyPreviewReady(
  session: ImageSession,
  source: Exclude<DisplaySource, 'none'>,
  payload: PreviewReadyPayload,
  decoded?: DecodedImage | null,
): ImageSession {
  const previewBundle = {
    ...session.previewBundle,
    embeddedPreview:
      source === 'embedded'
        ? {
            status: 'ready' as const,
            width: payload.width,
            height: payload.height,
            objectUrl: payload.objectUrl,
            mimeType: payload.mimeType,
            timings: payload.timings,
          }
        : session.previewBundle.embeddedPreview,
    quickDecodePreview:
      source === 'quick'
        ? {
            status: 'ready' as const,
            width: payload.width,
            height: payload.height,
            timings: payload.timings ?? decoded?.timings,
          }
        : session.previewBundle.quickDecodePreview,
    boundedHqPreview:
      source === 'bounded-hq'
        ? {
            status: 'ready' as const,
            width: payload.width,
            height: payload.height,
            timings: payload.timings ?? decoded?.timings,
          }
        : session.previewBundle.boundedHqPreview,
  }

  return {
    ...session,
    sourceFile: decoded
      ? {
          ...session.sourceFile,
          cameraBrand: decoded.metadata.make,
          cameraModel: decoded.metadata.model,
          rawFormat: session.sourceFile.extension,
          width: decoded.width,
          height: decoded.height,
          supportLevel: classifySupportLevel({
            cameraBrand: decoded.metadata.make,
            cameraModel: decoded.metadata.model,
            rawFormat: session.sourceFile.extension,
          }),
        }
      : session.sourceFile,
    previewBundle: {
      ...previewBundle,
      displaySource: selectDisplaySource(previewBundle),
    },
    renderState: {
      status: 'ready',
      lastRenderSource: source,
    },
  }
}

export function applyQuickPreviewFailure(
  session: ImageSession,
  errorCode: string,
): ImageSession {
  const previewBundle = {
    ...session.previewBundle,
    quickDecodePreview: {
      status: 'failed' as const,
      errorCode,
    },
    boundedHqPreview: {
      status: 'failed' as const,
      errorCode,
    },
  }

  return {
    ...session,
    previewBundle: {
      ...previewBundle,
      displaySource: selectDisplaySource(previewBundle),
    },
    renderState: {
      ...session.renderState,
      status: 'failed',
      lastErrorCode: errorCode,
    },
    exportState: {
      ...session.exportState,
      fullResCapability: {
        status: 'unsupported',
        reason: 'Quick preview did not complete.',
      },
    },
  }
}

export function applyBoundedHqPreviewFailure(
  session: ImageSession,
  errorCode: string,
): ImageSession {
  const previewBundle = {
    ...session.previewBundle,
    boundedHqPreview: {
      status: 'failed' as const,
      errorCode,
    },
  }

  return {
    ...session,
    previewBundle: {
      ...previewBundle,
      displaySource: selectDisplaySource(previewBundle),
    },
  }
}

export function applyBoundedHqPreviewSkipped(
  session: ImageSession,
  reason: string,
): ImageSession {
  const previewBundle = {
    ...session.previewBundle,
    boundedHqPreview: {
      status: 'skipped' as const,
      reason,
    },
  }

  return {
    ...session,
    previewBundle: {
      ...previewBundle,
      displaySource: selectDisplaySource(previewBundle),
    },
  }
}
