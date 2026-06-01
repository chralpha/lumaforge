import type { MutableRefObject } from 'react'
import { useCallback, useRef } from 'react'

import type { ExportResourceCleanupReason } from '~/lib/export/execution-profile'
import { emitExportDebugEvent } from '~/lib/export/execution-profile'
import type {
  LargeResourceOwner,
  ResourceRegistry,
} from '~/lib/export/resource-registry'

import type { ExportResult } from '../../../model/export-result'
import { toResourceCleanupDebugPayload } from '../../../services/export/export-evacuation'

type UseExportResourceManagementInput = {
  resourceRegistryRef: MutableRefObject<ResourceRegistry | null>
}

export function useExportResourceManagement({
  resourceRegistryRef,
}: UseExportResourceManagementInput) {
  const exportResultResourceIdRef = useRef(0)

  const registerExportResultResource = useCallback(
    (result: ExportResult) => {
      const registry = resourceRegistryRef.current
      if (!registry) return

      registry.register({
        id: `export-result-${++exportResultResourceIdRef.current}`,
        owner: 'export-result',
        kind: 'blob',
        estimatedBytes: result.size,
        dispose: () =>
          'cleanup' in result.output ? result.output.cleanup?.() : undefined,
      })
    },
    [resourceRegistryRef],
  )

  const disposeExportResultResources = useCallback(
    async (reason?: ExportResourceCleanupReason) => {
      const registry = resourceRegistryRef.current
      if (!registry) return

      const disposedOwners: LargeResourceOwner[] = ['export-result']
      await registry.disposeOwners(disposedOwners)

      if (!reason) return

      emitExportDebugEvent({
        type: 'resource-cleanup',
        payload: toResourceCleanupDebugPayload({
          reason,
          disposedOwners,
          registryCheck: registry.assertZeroLive(disposedOwners),
          snapshot: registry.snapshot(),
        }),
      })
    },
    [resourceRegistryRef],
  )

  const queueExportResultResourceDisposal = useCallback(
    (reason?: ExportResourceCleanupReason) => {
      void disposeExportResultResources(reason).catch((error) => {
        console.warn('Failed to clean up export result resources:', error)
      })
    },
    [disposeExportResultResources],
  )

  return {
    registerExportResultResource,
    disposeExportResultResources,
    queueExportResultResourceDisposal,
  }
}
