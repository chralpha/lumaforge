import { useEffect, useMemo, useRef, useState } from 'react'

import type { DecodedImage } from '~/lib/raw/decoder'

import type { DisplaySource } from '../model/session'
import { renderOriginalReferenceSnapshot } from '../services/original-reference-renderer'
import type { OriginalReferenceSnapshot } from '../services/original-reference-snapshot'
import {
  createOriginalReferenceSnapshotKey,
  getOriginalReferenceSnapshotMaxPixels,
  releaseOriginalReferenceSnapshot,
} from '../services/original-reference-snapshot'

export type OriginalReferenceSnapshotCapability = {
  webKitClass:
    | 'chromium'
    | 'webkit-desktop-safari'
    | 'webkit-mobile'
    | 'unknown'
  pthread: boolean
}

export type UseOriginalReferenceSnapshotInput = {
  sessionId: string | null
  image: DecodedImage | null
  imageVersion: number
  displaySource: DisplaySource
  capability: OriginalReferenceSnapshotCapability
  styleVersion?: number
  renderSnapshot?: typeof renderOriginalReferenceSnapshot
  releaseSnapshot?: typeof releaseOriginalReferenceSnapshot
}

function getOriginalReferenceSnapshotFallbackReason(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message
  ) {
    return error.message
  }

  return 'ORIGINAL_REFERENCE_SNAPSHOT_FAILED'
}

export function useOriginalReferenceSnapshot({
  sessionId,
  image,
  imageVersion,
  displaySource,
  capability,
  renderSnapshot = renderOriginalReferenceSnapshot,
  releaseSnapshot = releaseOriginalReferenceSnapshot,
}: UseOriginalReferenceSnapshotInput) {
  const [snapshot, setSnapshot] = useState<OriginalReferenceSnapshot | null>(
    null,
  )
  const [fallbackReason, setFallbackReason] = useState<string | null>(null)
  const snapshotRef = useRef<OriginalReferenceSnapshot | null>(null)

  const key = useMemo(() => {
    if (!sessionId || !image) return null
    if (displaySource !== 'quick' && displaySource !== 'bounded-hq') return null

    return createOriginalReferenceSnapshotKey({
      sessionId,
      displaySource,
      imageVersion,
      width: image.width,
      height: image.height,
      renderExposureEv: image.renderExposure.ev,
      policyVersion: 1,
    })
  }, [displaySource, image, imageVersion, sessionId])

  useEffect(() => {
    if (
      !key ||
      !image ||
      (displaySource !== 'quick' && displaySource !== 'bounded-hq')
    ) {
      const previous = snapshotRef.current
      if (previous) {
        snapshotRef.current = null
        setSnapshot(null)
        releaseSnapshot(previous)
      }
      setFallbackReason(null)
      return
    }
    if (snapshotRef.current?.key === key) return

    let cancelled = false
    setFallbackReason(null)

    const maxPixels = getOriginalReferenceSnapshotMaxPixels({
      displaySourcePixels: image.width * image.height,
      webKitClass: capability.webKitClass,
      pthread: capability.pthread,
    })

    void renderSnapshot({ image, key, maxPixels })
      .then((nextSnapshot) => {
        if (cancelled) {
          releaseSnapshot(nextSnapshot)
          return
        }
        const previous = snapshotRef.current
        snapshotRef.current = nextSnapshot
        setSnapshot(nextSnapshot)
        if (previous && previous.objectUrl !== nextSnapshot.objectUrl) {
          releaseSnapshot(previous)
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setFallbackReason(getOriginalReferenceSnapshotFallbackReason(error))
      })

    return () => {
      cancelled = true
    }
  }, [
    capability.pthread,
    capability.webKitClass,
    displaySource,
    image,
    key,
    releaseSnapshot,
    renderSnapshot,
  ])

  useEffect(() => {
    return () => {
      releaseSnapshot(snapshotRef.current)
      snapshotRef.current = null
    }
  }, [releaseSnapshot])

  return {
    snapshot,
    fallbackReason,
  }
}
