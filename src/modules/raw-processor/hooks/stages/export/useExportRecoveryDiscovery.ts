import type { Dispatch, SetStateAction } from 'react'
import { useEffect } from 'react'

import type { ExportCheckpointManifest } from '~/lib/export/checkpoint-store'
import {
  createCheckpointStore,
  createOpfsCheckpointBackend,
} from '~/lib/export/checkpoint-store'

import type { ExportRecoveryState, ImageSession } from '../../../model/session'
import { createInterruptedExportRecovery } from '../../../services/export/export-recovery'

type ExportRecoveryStore = {
  listSafeRetryCandidates: () => Promise<ExportCheckpointManifest[]>
}

type UseExportRecoveryDiscoveryInput = {
  setDiscoveredRecoveryState: (next: ExportRecoveryState) => void
  setSession: Dispatch<SetStateAction<ImageSession | null>>
  createRecoveryStore?: () => ExportRecoveryStore
}

function createDefaultRecoveryStore() {
  return createCheckpointStore(createOpfsCheckpointBackend())
}

export function useExportRecoveryDiscovery({
  setDiscoveredRecoveryState,
  setSession,
  createRecoveryStore = createDefaultRecoveryStore,
}: UseExportRecoveryDiscoveryInput) {
  useEffect(() => {
    let cancelled = false

    try {
      const store = createRecoveryStore()

      void store
        .listSafeRetryCandidates()
        .then((manifests) => {
          if (cancelled || manifests.length === 0) return

          const manifest = manifests[0]
          if (!manifest) return

          const recovery = createInterruptedExportRecovery(manifest)
          setDiscoveredRecoveryState(recovery)
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  exportState: {
                    ...prev.exportState,
                    recovery,
                  },
                }
              : prev,
          )
        })
        .catch(() => undefined)
    } catch {
      return () => {
        cancelled = true
      }
    }

    return () => {
      cancelled = true
    }
  }, [createRecoveryStore, setDiscoveredRecoveryState, setSession])
}
