import { SupportBadge } from './SupportBadge'

export function WorkspaceHeader({
  fileName,
  supportLevel,
  canExport,
  onReplaceFile,
  onResetSession,
  onOpenExport,
}: {
  fileName: string
  supportLevel: 'official' | 'experimental'
  canExport: boolean
  onReplaceFile: () => void
  onResetSession: () => void
  onOpenExport: () => void
}) {
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
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReplaceFile}
          className="rounded-lg bg-fill px-3 py-2 text-sm text-text"
        >
          Replace file
        </button>
        <button
          type="button"
          onClick={onResetSession}
          className="rounded-lg bg-fill px-3 py-2 text-sm text-text"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onOpenExport}
          disabled={!canExport}
          className="rounded-lg bg-accent px-3 py-2 text-sm text-background disabled:opacity-50"
        >
          Export JPEG
        </button>
      </div>
    </header>
  )
}
