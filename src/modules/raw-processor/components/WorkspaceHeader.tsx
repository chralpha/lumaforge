import { useAtomValue } from 'jotai'

import {
  currentSessionAtom,
  exportDisabledReasonAtom,
} from '../state/session.atoms'
import { SupportBadge } from './SupportBadge'

export function WorkspaceHeader({
  fileName,
  hasImage,
  supportLevel,
  canExport,
  disabledReason,
  onReplaceFile,
  onResetSession,
  onOpenExport,
}: {
  fileName?: string
  hasImage: boolean
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
    ? (disabledReason ??
      sessionDisabledReason ??
      'Full-resolution export source is still loading.')
    : undefined

  return (
    <header className="raw-lab-topbar" role="banner">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-3">
          <span className="raw-lab-mark" aria-hidden="true" />
          <h1 className="truncate text-base font-semibold text-[oklch(0.18_0.018_76)]">
            {hasImage ? fileName : 'RAW Lab'}
          </h1>
          {hasImage && <SupportBadge level={supportLevel} />}
        </div>
        <p className="mt-1 truncate text-xs text-[oklch(0.38_0.032_75)]">
          {hasImage
            ? 'Browser-local RAW finishing workspace'
            : 'Drop one RAW to preview, compare, finish, and export locally.'}
        </p>
        {exportDisabledReason && (
          <p className="mt-1 truncate text-xs text-[oklch(0.38_0.032_75)]">
            Full-res JPEG unavailable: {exportDisabledReason}
          </p>
        )}
      </div>

      <div className="raw-lab-topbar-actions">
        <button
          type="button"
          onClick={onReplaceFile}
          disabled={isExporting}
          className="raw-lab-topbar-button"
        >
          {hasImage ? 'Replace' : 'Choose RAW'}
        </button>
        <button
          type="button"
          onClick={onResetSession}
          disabled={!hasImage || isExporting}
          className="raw-lab-topbar-button"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onOpenExport}
          disabled={!canExport}
          className="raw-lab-topbar-button raw-lab-topbar-button-primary"
        >
          Full-res JPEG
        </button>
      </div>
    </header>
  )
}
