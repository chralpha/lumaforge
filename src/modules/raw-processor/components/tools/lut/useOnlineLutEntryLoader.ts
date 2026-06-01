import { useCallback, useState } from 'react'

type LoadOnlineLutEntry = (entryId: string) => Promise<void>

export function useOnlineLutEntryLoader(loadEntry?: LoadOnlineLutEntry) {
  const [loadingEntryId, setLoadingEntryId] = useState<string | null>(null)

  const loadOnlineLutEntry = useCallback(
    async (entryId: string, onLoaded?: () => void) => {
      if (loadingEntryId || !loadEntry) return

      setLoadingEntryId(entryId)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      )

      try {
        await loadEntry(entryId)
        onLoaded?.()
      } catch {
        // Existing issue chips surface per-source failures.
      } finally {
        setLoadingEntryId(null)
      }
    },
    [loadEntry, loadingEntryId],
  )

  return { loadingEntryId, loadOnlineLutEntry }
}
