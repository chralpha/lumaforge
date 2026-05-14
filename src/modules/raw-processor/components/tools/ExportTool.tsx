import './export-tool.css'

import { useAtomValue } from 'jotai'
import { Copy, Download, FolderOpen, Share2 } from 'lucide-react'

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
import { ToolSection } from './ToolSection'

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
}) {
  const { t } = useI18n()
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

  return (
    <ToolSection
      title={t('raw.export.title')}
      eyebrow={t('raw.export.eyebrow')}
    >
      {exportResult ? (
        <div className="raw-export-result">
          <div className="raw-export-result-heading">
            <span>{t('raw.export.ready')}</span>
            <strong>{exportResult.filename}</strong>
          </div>
          <dl className="raw-export-result-facts">
            <div>
              <dt>{t('raw.export.dimensions')}</dt>
              <dd>
                {exportResult.width} x {exportResult.height}
              </dd>
            </div>
            <div>
              <dt>{t('raw.export.fileSize')}</dt>
              <dd>{formatBytes(exportResult.size)}</dd>
            </div>
          </dl>
          <div className="raw-export-actions">
            <button
              type="button"
              className="raw-export-button raw-export-button-primary"
              disabled={!exportShareCapability.available}
              onClick={onShareExport}
            >
              <Share2 aria-hidden="true" />
              {t('raw.export.share')}
            </button>
            <button
              type="button"
              className="raw-export-button raw-export-button-secondary"
              onClick={onDownloadExport}
            >
              <Download aria-hidden="true" />
              {t('raw.export.download')}
            </button>
            {exportResult.copyCapability.mode === 'unavailable' ? (
              <button
                type="button"
                className="raw-export-button raw-export-button-secondary"
                disabled
              >
                <Copy aria-hidden="true" />
                {copyButtonLabel}
              </button>
            ) : (
              <button
                type="button"
                className="raw-export-button raw-export-button-secondary"
                onClick={onCopyExport}
              >
                <Copy aria-hidden="true" />
                {copyButtonLabel}
              </button>
            )}
          </div>
          {!exportShareCapability.available && (
            <p className="raw-tool-note">{shareUnavailableReason}</p>
          )}
          {exportResult.copyCapability.mode !== 'full-resolution' && (
            <p className="raw-tool-note">{copyUnavailableReason}</p>
          )}
        </div>
      ) : (
        <>
          {isLowMemoryPlan && (
            <p className="raw-tool-note">{t('raw.export.lowMemory')}</p>
          )}
          {currentCheckpointDurable === false && isLowMemoryPlan && (
            <p className="raw-tool-note">{t('raw.export.nonDurable')}</p>
          )}
          {currentRecovery?.status === 'source-required' && (
            <>
              <p className="raw-tool-note">{currentRecovery.message}</p>
              <button
                type="button"
                className="raw-export-button raw-export-button-secondary"
                disabled={!onRecoverExportSource || isProcessing}
                onClick={onRecoverExportSource}
              >
                <FolderOpen aria-hidden="true" />
                {t('raw.export.reselect')}
              </button>
            </>
          )}
          <button
            type="button"
            className="raw-export-button raw-export-button-primary"
            disabled={!canExport || isProcessing}
            onClick={() => onExport({ quality: 'high', fidelity: 'balanced' })}
          >
            <Download aria-hidden="true" />
            {isProcessing ? t('raw.export.preparing') : t('raw.export.run')}
          </button>
          <p className="raw-tool-note">
            {canExport ? t('raw.export.sourcePath') : unavailableReason}
          </p>
        </>
      )}
    </ToolSection>
  )
}
