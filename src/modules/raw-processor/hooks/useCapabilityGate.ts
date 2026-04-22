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

    return {
      ready: true,
      supportStatus: 'supported' as const,
      reason: null,
    }
  }, [])
}
