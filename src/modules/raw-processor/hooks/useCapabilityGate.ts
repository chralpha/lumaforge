import { useMemo } from 'react'

import { detectCapabilities } from '~/lib/gl/context'

export function useCapabilityGate() {
  return useMemo(() => {
    const caps = detectCapabilities()

    if (!caps.webgl2) {
      return {
        ready: true,
        supportStatus: 'unsupported' as const,
        reason: 'WebGL2 is required',
      }
    }

    if (!caps.toneHighPrecision) {
      return {
        ready: true,
        supportStatus: 'unsupported' as const,
        reason:
          'High precision fragment shader math is required for RAW tone controls',
      }
    }

    if (
      typeof globalThis.crossOriginIsolated === 'boolean' &&
      !globalThis.crossOriginIsolated
    ) {
      return {
        ready: true,
        supportStatus: 'unsupported' as const,
        reason: 'Cross-origin isolation is required for pthread RAW decode',
      }
    }

    return {
      ready: true,
      supportStatus: 'supported' as const,
      reason: null,
    }
  }, [])
}
