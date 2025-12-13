/**
 * Hook to access the pipeline ref for export operations.
 */

import { useRef } from 'react'

import type { RawProcessingPipeline } from '~/lib/gl/pipeline'

export function usePipelineRef() {
  const ref = useRef<RawProcessingPipeline | null>(null)
  return ref
}
