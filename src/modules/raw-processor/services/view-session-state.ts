import type { ProcessingParams } from '@lumaforge/luma-color-runtime'

import type { ImageSession } from '../model/session'
import { clampCompareSplit } from './compare-split'
import type { PreviewViewport } from './preview-viewport'
import { normalizePreviewViewport } from './preview-viewport'

export function applyViewModeToSession(
  session: ImageSession,
  mode: ProcessingParams['viewMode'],
): ImageSession {
  return {
    ...session,
    viewState: {
      ...session.viewState,
      mode,
    },
  }
}

export function applyCompareSplitToSession(
  session: ImageSession,
  split: number,
): ImageSession {
  return {
    ...session,
    viewState: {
      ...session.viewState,
      compareSplit: clampCompareSplit(split),
    },
  }
}

export function applyPreviewViewportToSession(
  session: ImageSession,
  viewport: PreviewViewport,
): ImageSession {
  return {
    ...session,
    viewState: {
      ...session.viewState,
      ...normalizePreviewViewport(viewport),
    },
  }
}
