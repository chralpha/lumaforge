import { useMemo } from 'react'

import { detectCapabilities } from '~/lib/gl/context'
import type { RawPreviewCapability } from '~/lib/preview/raw-preview-capability'
import { resolveRawPreviewCapability } from '~/lib/preview/raw-preview-capability'

export type RawCapabilityGate = { ready: true } & RawPreviewCapability

function isLocalCpuPreviewOverrideEnabled() {
  if (typeof window === 'undefined') return false
  if (
    new URLSearchParams(window.location.search).get('forcePreview') !== 'cpu'
  ) {
    return false
  }
  if (!import.meta.env.PROD) return true

  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(
    window.location.hostname,
  )
}

export function useCapabilityGate(): RawCapabilityGate {
  return useMemo(() => {
    const caps = detectCapabilities()
    const forceCpuPreview = isLocalCpuPreviewOverrideEnabled()
    const coi =
      typeof globalThis.crossOriginIsolated === 'boolean'
        ? globalThis.crossOriginIsolated
        : true
    const capability = resolveRawPreviewCapability(
      {
        webgl2: caps.webgl2,
        toneHighPrecision: forceCpuPreview ? false : caps.toneHighPrecision,
      },
      coi,
    )
    return { ready: true, ...capability }
  }, [])
}
