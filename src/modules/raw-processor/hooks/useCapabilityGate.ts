import { useMemo } from 'react'

import { detectCapabilities } from '~/lib/gl/context'
import type { RawPreviewCapability } from '~/lib/preview/raw-preview-capability'
import { resolveRawPreviewCapability } from '~/lib/preview/raw-preview-capability'

export type RawCapabilityGate = { ready: true } & RawPreviewCapability

export function useCapabilityGate(): RawCapabilityGate {
  return useMemo(() => {
    const caps = detectCapabilities()
    const coi =
      typeof globalThis.crossOriginIsolated === 'boolean'
        ? globalThis.crossOriginIsolated
        : true
    const capability = resolveRawPreviewCapability(
      { webgl2: caps.webgl2, toneHighPrecision: caps.toneHighPrecision },
      coi,
    )
    return { ready: true, ...capability }
  }, [])
}
