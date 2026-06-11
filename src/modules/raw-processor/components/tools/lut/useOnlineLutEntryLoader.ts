import { useCallback, useState } from 'react'

import type { UseOnlineLutSourcesResult } from '../../../hooks/useOnlineLutSources'

type EntryLoaderSource = Pick<
  UseOnlineLutSourcesResult,
  'loadEntry' | 'loadingEntryId' | 'failedEntryId'
>

/**
 * Per-surface shell over the shared entry-load lifecycle. Loading/failed
 * state and the one-load-at-a-time lock are owned by useOnlineLutSources so
 * every surface (desktop inline, dialog, mobile pills, mobile catalog) sees
 * the same lock and the cancel handle can never be stolen by a second
 * surface. The shell only adds a same-frame click ack (local pending state
 * bridged until the shared lock engages after the rAF yield) and gates the
 * success callback on the load outcome.
 */
export function useOnlineLutEntryLoader(source?: EntryLoaderSource) {
  const [pendingEntryId, setPendingEntryId] = useState<string | null>(null)
  const loadingEntryId = source?.loadingEntryId ?? pendingEntryId
  const failedEntryId = source?.failedEntryId ?? null

  const loadOnlineLutEntry = useCallback(
    async (entryId: string, onLoaded?: () => void) => {
      if (!source || source.loadingEntryId || pendingEntryId) return

      setPendingEntryId(entryId)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      )

      try {
        const outcome = await source
          .loadEntry(entryId)
          .catch((): 'failed' => 'failed')
        if (outcome === 'loaded') onLoaded?.()
      } finally {
        setPendingEntryId(null)
      }
    },
    [source, pendingEntryId],
  )

  return { loadingEntryId, failedEntryId, loadOnlineLutEntry }
}
