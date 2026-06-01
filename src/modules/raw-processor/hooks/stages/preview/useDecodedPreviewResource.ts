import type { RawRenderExposure } from '@lumaforge/luma-color-runtime'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useCallback, useRef } from 'react'

import type {
  ResourceRegistry,
  TrackedLargeResource,
} from '~/lib/export/resource-registry'
import type { DecodedImage } from '~/lib/raw/decoder'

import { hasSameRawRenderExposure } from '../../../services/export/export-state'

type UseDecodedPreviewResourceInput = {
  decodedImageRef: MutableRefObject<DecodedImage | null>
  rawRenderExposureRef: MutableRefObject<RawRenderExposure | null>
  resourceRegistryRef: MutableRefObject<ResourceRegistry | null>
  setDecodedImageVersion: Dispatch<SetStateAction<number>>
  invalidateExportGraph: () => void
}

export function useDecodedPreviewResource({
  decodedImageRef,
  rawRenderExposureRef,
  resourceRegistryRef,
  setDecodedImageVersion,
  invalidateExportGraph,
}: UseDecodedPreviewResourceInput) {
  const decodedPreviewResourceIdRef = useRef(0)
  const decodedPreviewResourceRef = useRef<TrackedLargeResource | null>(null)

  const registerDecodedPreviewForEvacuation = useCallback(
    (decoded: DecodedImage | null) => {
      const previousResource = decodedPreviewResourceRef.current
      decodedPreviewResourceRef.current = null
      if (previousResource) {
        void previousResource.dispose().catch((error) => {
          console.warn('Failed to clean up decoded preview resource:', error)
        })
      }

      const registry = resourceRegistryRef.current
      if (!decoded || !registry) return

      let tracked: TrackedLargeResource | null = null
      tracked = registry.register({
        id: `decoded-preview-${++decodedPreviewResourceIdRef.current}`,
        owner: 'preview',
        kind: 'array-buffer',
        estimatedBytes: decoded.data.byteLength,
        dispose: () => {
          if (decodedPreviewResourceRef.current === tracked) {
            decodedPreviewResourceRef.current = null
          }
          if (decodedImageRef.current === decoded) {
            decodedImageRef.current = null
            setDecodedImageVersion((version) => version + 1)
          }
        },
      })
      decodedPreviewResourceRef.current = tracked
    },
    [decodedImageRef, resourceRegistryRef, setDecodedImageVersion],
  )

  const setDecodedImageRef = useCallback(
    (
      nextDecoded: DecodedImage | null,
      options?: { preserveExportResult?: boolean },
    ) => {
      const currentExposure = rawRenderExposureRef.current
      const nextExposure = nextDecoded?.renderExposure ?? null
      decodedImageRef.current = nextDecoded
      rawRenderExposureRef.current = nextExposure
      registerDecodedPreviewForEvacuation(nextDecoded)
      setDecodedImageVersion((version) => version + 1)

      if (
        !options?.preserveExportResult &&
        !hasSameRawRenderExposure(currentExposure, nextExposure)
      ) {
        invalidateExportGraph()
      }
    },
    [
      decodedImageRef,
      invalidateExportGraph,
      rawRenderExposureRef,
      registerDecodedPreviewForEvacuation,
      setDecodedImageVersion,
    ],
  )

  return { setDecodedImageRef }
}
