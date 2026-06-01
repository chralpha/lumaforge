import type { MutableRefObject } from 'react'
import { useCallback } from 'react'

import type { ImageSession } from '../../../model/session'
import {
  clearEmbeddedPreviewUrlFromSession,
  revokeEmbeddedPreviewObjectUrls,
} from '../../../services/preview/embedded-preview-url'

export type SetImageSession = (
  update:
    | ImageSession
    | null
    | ((prev: ImageSession | null) => ImageSession | null),
) => void

type UseEmbeddedPreviewUrlLifecycleInput = {
  embeddedPreviewUrlRef: MutableRefObject<string | null>
  sessionRef: MutableRefObject<ImageSession | null>
  setSession: SetImageSession
  revokeObjectUrls?: typeof revokeEmbeddedPreviewObjectUrls
}

export function useEmbeddedPreviewUrlLifecycle({
  embeddedPreviewUrlRef,
  sessionRef,
  setSession,
  revokeObjectUrls = revokeEmbeddedPreviewObjectUrls,
}: UseEmbeddedPreviewUrlLifecycleInput) {
  const clearSessionEmbeddedPreviewUrl = useCallback(
    (sessionId?: string) => {
      setSession((prev) => {
        if (!prev || (sessionId && prev.id !== sessionId)) {
          return prev
        }

        if (!prev.previewBundle.embeddedPreview.objectUrl) {
          return prev
        }

        return clearEmbeddedPreviewUrlFromSession(prev)
      })
    },
    [setSession],
  )

  const revokeCurrentEmbeddedPreviewUrl = useCallback(() => {
    const sessionId = sessionRef.current?.id
    const urls = new Set(
      [
        embeddedPreviewUrlRef.current,
        sessionRef.current?.previewBundle.embeddedPreview.objectUrl,
      ].filter((url): url is string => Boolean(url)),
    )

    revokeObjectUrls(urls)

    embeddedPreviewUrlRef.current = null
    clearSessionEmbeddedPreviewUrl(sessionId)
  }, [
    clearSessionEmbeddedPreviewUrl,
    embeddedPreviewUrlRef,
    revokeObjectUrls,
    sessionRef,
  ])

  return {
    clearSessionEmbeddedPreviewUrl,
    revokeCurrentEmbeddedPreviewUrl,
  }
}
