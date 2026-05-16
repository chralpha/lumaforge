import { useAtomValue } from 'jotai'
import { Copy, Download, FolderOpen, Share2 } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { localizeCopyLabel, localizeRawReason, useI18n } from '~/lib/i18n'

import type {
  ExportResult,
  ExportShareCapability,
} from '../../model/export-result'
import type {
  ActiveExportPlanState,
  ExportRecoveryState,
} from '../../model/session'
import { currentSessionAtom } from '../../state/session.atoms'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ExportTool({
  canExport,
  disabledReason,
  isProcessing,
  onExport,
  exportResult,
  exportShareCapability,
  onShareExport,
  onDownloadExport,
  onCopyExport,
  onRecoverExportSource,
  activePlan,
  recovery,
  checkpointDurable,
}: {
  canExport: boolean
  disabledReason?: string
  isProcessing: boolean
  onExport: (options: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
  }) => void
  exportResult: ExportResult | null
  exportShareCapability: ExportShareCapability
  onShareExport: () => void | Promise<void>
  onDownloadExport: () => void
  onCopyExport: () => void | Promise<void>
  onRecoverExportSource?: () => void
  activePlan?: ActiveExportPlanState
  recovery?: ExportRecoveryState
  checkpointDurable?: boolean
  embedded?: boolean
}) {
  const { t } = useI18n()
  const noteClassName = 'text-callout leading-relaxed text-text-secondary'
  const session = useAtomValue(currentSessionAtom)
  const currentActivePlan = activePlan ?? session?.exportState.activePlan
  const currentRecovery = recovery ?? session?.exportState.recovery
  const currentCheckpointDurable =
    checkpointDurable ?? session?.exportState.checkpointDurable
  const isLowMemoryPlan =
    currentActivePlan?.runtimeMemoryProfile === 'low-memory'
  const unavailableReason =
    localizeRawReason(disabledReason, t) || t('raw.exportSourceLoading')
  const shareUnavailableReason =
    exportShareCapability.available === false
      ? localizeRawReason(exportShareCapability.reason, t)
      : undefined
  const copyCapability = exportResult?.copyCapability
  const copyUnavailableReason =
    copyCapability && copyCapability.mode !== 'full-resolution'
      ? localizeRawReason(copyCapability.reason, t)
      : undefined
  const copyButtonLabel = copyCapability
    ? copyCapability.mode === 'unavailable'
      ? t('raw.export.copy')
      : localizeCopyLabel(copyCapability.label, t)
    : t('raw.export.copy')

  const innerContent = (
    <div className="grid min-w-0 gap-3">
      {exportResult ? (
        <div className="grid min-w-0 gap-3">
          <div className="grid min-w-0 gap-1 text-callout text-text-secondary">
            <span>{t('raw.export.ready')}</span>
            <strong
              className="min-w-0 truncate text-body text-text"
              title={exportResult.filename}
            >
              {exportResult.filename}
            </strong>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-callout">
            <div>
              <dt className="text-text-secondary">
                {t('raw.export.dimensions')}
              </dt>
              <dd className="text-text">
                {exportResult.width} x {exportResult.height}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">
                {t('raw.export.fileSize')}
              </dt>
              <dd className="text-text">{formatBytes(exportResult.size)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              size="md"
              disabled={!exportShareCapability.available}
              onClick={onShareExport}
            >
              <Share2 className="size-4 shrink-0" aria-hidden="true" />
              {t('raw.export.share')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={onDownloadExport}
            >
              <Download className="size-4 shrink-0" aria-hidden="true" />
              {t('raw.export.download')}
            </Button>
            {exportResult.copyCapability.mode === 'unavailable' ? (
              <Button type="button" variant="secondary" size="md" disabled>
                <Copy className="size-4 shrink-0" aria-hidden="true" />
                {copyButtonLabel}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={onCopyExport}
              >
                <Copy className="size-4 shrink-0" aria-hidden="true" />
                {copyButtonLabel}
              </Button>
            )}
          </div>
          {!exportShareCapability.available && (
            <p className={noteClassName}>{shareUnavailableReason}</p>
          )}
          {exportResult.copyCapability.mode !== 'full-resolution' && (
            <p className={noteClassName}>{copyUnavailableReason}</p>
          )}
        </div>
      ) : (
        <>
          {isLowMemoryPlan && (
            <p className={noteClassName}>{t('raw.export.lowMemory')}</p>
          )}
          {currentCheckpointDurable === false && isLowMemoryPlan && (
            <p className={noteClassName}>{t('raw.export.nonDurable')}</p>
          )}
          {currentRecovery?.status === 'source-required' && (
            <>
              <p className={noteClassName}>{currentRecovery.message}</p>
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={!onRecoverExportSource || isProcessing}
                onClick={onRecoverExportSource}
              >
                <FolderOpen className="size-4 shrink-0" aria-hidden="true" />
                {t('raw.export.reselect')}
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={!canExport || isProcessing}
            onClick={() => onExport({ quality: 'high', fidelity: 'balanced' })}
          >
            <Download className="size-4 shrink-0" aria-hidden="true" />
            {isProcessing ? t('raw.export.preparing') : t('raw.export.run')}
          </Button>
          <p className={noteClassName}>
            {canExport ? t('raw.export.sourcePath') : unavailableReason}
          </p>
        </>
      )}
    </div>
  )

  return innerContent
}
