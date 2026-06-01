import type { LUTData } from '@lumaforge/luma-color-runtime'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ParsedLUT } from '~/lib/lut/cube-parser'
import { toLUTData } from '~/lib/lut/cube-parser'

export function useLutDataState(lut: ParsedLUT | null) {
  const lutDataRef = useRef<LUTData | null>(null)
  const [lutDataVersion, setLutDataVersion] = useState(0)

  const setLutDataRef = useCallback((nextLutData: LUTData | null) => {
    lutDataRef.current = nextLutData
    setLutDataVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    if (lut) {
      setLutDataRef(toLUTData(lut))
    } else {
      setLutDataRef(null)
    }
  }, [lut, setLutDataRef])

  return { lutDataRef, lutDataVersion, setLutDataRef }
}
