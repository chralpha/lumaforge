import { useAtomValue } from 'jotai'

import {
  currentSessionAtom,
  exportDisabledReasonAtom,
} from '../state/session.atoms'
import { SupportBadge } from './SupportBadge'

export function WorkspaceHeader({
  fileName,
  supportLevel,
  canExport,
  disabledReason,
  onReplaceFile,
  onResetSession,
  onOpenExport,
}: {
  fileName: string
  supportLevel: 'official' | 'experimental'
  canExport: boolean
  disabledReason?: string
  onReplaceFile: () => void
  onResetSession: () => void
  onOpenExport: () => void
}) {
  const session = useAtomValue(currentSessionAtom)
  const sessionDisabledReason = useAtomValue(exportDisabledReasonAtom)
  const isExporting = session?.exportState.status === 'exporting'
  const exportDisabledReason = !canExport
    ? disabledReason ??
      sessionDisabledReason ??
      'Full-resolution export source is still loading.'
    : undefined

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="truncate text-lg font-semibold text-text">
            {fileName}
          </h1>
          <SupportBadge level={supportLevel} />
        </div>
        <p className="text-xs text-text-tertiary">
          Browser-local RAW styling workspace
        </p>
        {exportDisabledReason && (
          <p className="mt-1 text-xs text-text-secondary">
            Full-res JPEG unavailable: {exportDisabledReason}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReplaceFile}
          disabled={isExporting}
          className="rounded-lg bg-fill px-3 py-2 text-sm text-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          Replace file
        </button>
        <button
          type="button"
          onClick={onResetSession}
          disabled={isExporting}
          className="rounded-lg bg-fill px-3 py-2 text-sm text-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onOpenExport}
          disabled={!canExport}
          className="rounded-lg bg-accent px-3 py-2 text-sm text-background disabled:opacity-50"
        >
          Full-res JPEG
        </button>
      </div>
    </header>
  )
}
