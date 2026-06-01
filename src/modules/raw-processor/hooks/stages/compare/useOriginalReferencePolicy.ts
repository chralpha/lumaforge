import type { MutableRefObject } from 'react'
import { useCallback, useEffect, useState } from 'react'

import {
  classifyUserAgent,
  getCapabilityVectorSnapshot,
} from '~/lib/runtime/capability-vector'

import type { ImageSession } from '../../../model/session'
import { supportsLayeredCompareCss } from '../../../services/compare/compare-render-mode'
import type { OriginalReferenceSnapshotCapability } from '../../useOriginalReferenceSnapshot'

type UseOriginalReferencePolicyInput = {
  sessionId: string | null
  sessionRef: MutableRefObject<ImageSession | null>
  viewMode: 'processed' | 'original' | 'compare'
  previewSuspended: boolean
  getCapability?: () => OriginalReferenceSnapshotCapability
  supportsCssCompare?: () => boolean
}

function getOriginalReferenceSnapshotCapability(): OriginalReferenceSnapshotCapability {
  const capability = getCapabilityVectorSnapshot()
  if (capability) {
    return {
      webKitClass: capability.webKitClass,
      pthread: capability.pthread,
    }
  }

  const nav = globalThis.navigator
  const touch =
    typeof nav?.maxTouchPoints === 'number' ? nav.maxTouchPoints > 0 : false

  return {
    webKitClass: classifyUserAgent(nav?.userAgent ?? '', touch),
    pthread:
      Boolean(globalThis.crossOriginIsolated) &&
      typeof SharedArrayBuffer !== 'undefined',
  }
}

function allowDualWebglCompare(
  capability: OriginalReferenceSnapshotCapability,
) {
  return capability.webKitClass === 'chromium' && capability.pthread
}

export function useOriginalReferencePolicy({
  sessionId,
  sessionRef,
  viewMode,
  previewSuspended,
  getCapability = getOriginalReferenceSnapshotCapability,
  supportsCssCompare = supportsLayeredCompareCss,
}: UseOriginalReferencePolicyInput) {
  const [fallbackRequestSessionId, setFallbackRequestSessionId] = useState<
    string | null
  >(null)
  const originalReferenceCapability = getCapability()
  const dualWebglAllowed = allowDualWebglCompare(originalReferenceCapability)
  const cssCompareSupported = supportsCssCompare()
  const originalReferenceFallbackRequested =
    Boolean(sessionId) && fallbackRequestSessionId === sessionId

  useEffect(() => {
    if (viewMode !== 'compare' || previewSuspended) {
      setFallbackRequestSessionId(null)
    }
  }, [previewSuspended, viewMode])

  const requestOriginalReferenceFallback = useCallback(() => {
    setFallbackRequestSessionId(sessionRef.current?.id ?? null)
  }, [sessionRef])

  const shouldPrepareOriginalReferenceSnapshot =
    viewMode === 'compare' &&
    !previewSuspended &&
    cssCompareSupported &&
    (!dualWebglAllowed || originalReferenceFallbackRequested)

  return {
    originalReferenceCapability,
    dualWebglAllowed,
    supportsCssCompare: cssCompareSupported,
    shouldPrepareOriginalReferenceSnapshot,
    requestOriginalReferenceFallback,
  }
}
