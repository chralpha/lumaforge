import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useCallback, useEffect } from 'react'
import { toast as sonnerToast } from 'sonner'

import type { ExportCheckpointManifest } from '~/lib/export/checkpoint-store'

import type { ExportRecoveryState, ImageSession } from '../../../model/session'
import type { ProcessingStatus } from '../../../model/workflow'
import { validateRecoveryReselection } from '../../../services/export/export-recovery'

export type PendingRecoveryRetry = {
  sourceExportId: string
  manifest: ExportCheckpointManifest
  sessionId: string
  fileName: string
  size: number
  lastModified: number
}

type ExportRecoveryToast = {
  error: (message: string, options?: { description?: string }) => void
}

type ExportImageForRecovery = (options: {
  quality: 'standard' | 'high'
  fidelity: 'safe' | 'balanced' | 'max'
  previousInterrupted?: boolean
  recoveredExportId?: string
  recoveredManifest?: ExportCheckpointManifest
}) => Promise<void>

type UseExportRecoveryActionInput = {
  pendingRecoveryRetry: PendingRecoveryRetry | null
  setPendingRecoveryRetry: Dispatch<SetStateAction<PendingRecoveryRetry | null>>
  sessionRef: MutableRefObject<ImageSession | null>
  discoveredRecoveryRef: MutableRefObject<ExportRecoveryState>
  loadedFile: File | null
  canExport: boolean
  status: ProcessingStatus
  loadFile: (file: File) => Promise<void>
  exportImage: ExportImageForRecovery
  scheduleToast: (notify: () => void) => void
  toast?: ExportRecoveryToast
}

export function useExportRecoveryAction({
  pendingRecoveryRetry,
  setPendingRecoveryRetry,
  sessionRef,
  discoveredRecoveryRef,
  loadedFile,
  canExport,
  status,
  loadFile,
  exportImage,
  scheduleToast,
  toast = sonnerToast,
}: UseExportRecoveryActionInput) {
  useEffect(() => {
    if (!pendingRecoveryRetry) return

    if (status === 'error') {
      setPendingRecoveryRetry(null)
      return
    }

    const activeSession = sessionRef.current
    const activeFile = loadedFile
    if (
      !activeSession ||
      activeSession.id !== pendingRecoveryRetry.sessionId ||
      !activeFile ||
      activeFile.name !== pendingRecoveryRetry.fileName ||
      activeFile.size !== pendingRecoveryRetry.size ||
      activeFile.lastModified !== pendingRecoveryRetry.lastModified
    ) {
      setPendingRecoveryRetry(null)
      return
    }

    if (!canExport || status !== 'ready') {
      return
    }

    setPendingRecoveryRetry(null)
    void exportImage({
      quality: 'high',
      fidelity: 'safe',
      previousInterrupted: true,
      recoveredExportId: pendingRecoveryRetry.sourceExportId,
      recoveredManifest: pendingRecoveryRetry.manifest,
    })
  }, [
    canExport,
    exportImage,
    loadedFile,
    pendingRecoveryRetry,
    sessionRef,
    setPendingRecoveryRetry,
    status,
  ])

  const recoverInterruptedExport = useCallback(
    async (file: File) => {
      const sessionRecovery = sessionRef.current?.exportState.recovery
      const recovery =
        sessionRecovery?.status === 'source-required'
          ? sessionRecovery
          : discoveredRecoveryRef.current.status === 'source-required'
            ? discoveredRecoveryRef.current
            : null
      if (!recovery || recovery.status !== 'source-required') {
        return
      }

      const validation = await validateRecoveryReselection(
        file,
        recovery.manifest,
      )
      if (!validation.ok) {
        scheduleToast(() =>
          toast.error('RAW file does not match', {
            description: validation.reason,
          }),
        )
        return
      }

      await loadFile(file)

      const activeSession = sessionRef.current
      if (
        activeSession?.sourceFile.name !== file.name ||
        activeSession.sourceFile.sizeBytes !== file.size
      ) {
        return
      }

      setPendingRecoveryRetry({
        sourceExportId: recovery.exportId,
        manifest: recovery.manifest,
        sessionId: activeSession.id,
        fileName: file.name,
        size: file.size,
        lastModified: file.lastModified,
      })
    },
    [
      discoveredRecoveryRef,
      loadFile,
      scheduleToast,
      sessionRef,
      setPendingRecoveryRetry,
      toast,
    ],
  )

  return { recoverInterruptedExport }
}
