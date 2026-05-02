import { useAtomValue } from 'jotai'
import { Copy, Download, FolderOpen, Share2 } from 'lucide-react'

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
  const session = useAtomValue(currentSessionAtom)
  const currentActivePlan = activePlan ?? session?.exportState.activePlan
  const currentRecovery = recovery ?? session?.exportState.recovery
  const currentCheckpointDurable =
    checkpointDurable ?? session?.exportState.checkpointDurable
  const isLowMemoryPlan =
    currentActivePlan?.runtimeMemoryProfile === 'low-memory'
  const unavailableReason =
    disabledReason || 'Full-resolution export source is still loading.'

  return (
    <ToolSection title="Export" eyebrow="Full-res JPEG">
      {exportResult ? (
        <div className="raw-export-result">
          <div className="raw-export-result-heading">
            <span>JPEG ready</span>
            <strong>{exportResult.filename}</strong>
          </div>
          <dl className="raw-export-result-facts">
            <div>
              <dt>Dimensions</dt>
              <dd>
                {exportResult.width} x {exportResult.height}
              </dd>
            </div>
            <div>
              <dt>File size</dt>
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
              Share
            </button>
            <button
              type="button"
              className="raw-export-button raw-export-button-secondary"
              onClick={onDownloadExport}
            >
              <Download aria-hidden="true" />
              Download
            </button>
            {exportResult.copyCapability.mode === 'unavailable' ? (
              <button
                type="button"
                className="raw-export-button raw-export-button-secondary"
                disabled
              >
                <Copy aria-hidden="true" />
                Copy
              </button>
            ) : (
              <button
                type="button"
                className="raw-export-button raw-export-button-secondary"
                onClick={onCopyExport}
              >
                <Copy aria-hidden="true" />
                {exportResult.copyCapability.label}
              </button>
            )}
          </div>
          {!exportShareCapability.available && (
            <p className="raw-tool-note">{exportShareCapability.reason}</p>
          )}
          {exportResult.copyCapability.mode !== 'full-resolution' && (
            <p className="raw-tool-note">
              {exportResult.copyCapability.reason}
            </p>
          )}
        </div>
      ) : (
        <>
          {isLowMemoryPlan && (
            <p className="raw-tool-note">
              This device is using low-memory export mode. Export may take
              longer.
            </p>
          )}
          {currentCheckpointDurable === false && isLowMemoryPlan && (
            <p className="raw-tool-note">
              This browser cannot store export progress. Keep the tab open while
              the JPEG is being written.
            </p>
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
                Reselect RAW and retry
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
            {isProcessing ? 'Preparing JPEG...' : 'Export full-resolution JPEG'}
          </button>
          <p className="raw-tool-note">
            {canExport
              ? 'Exports from the LibRaw processed-window path.'
              : unavailableReason}
          </p>
        </>
      )}
    </ToolSection>
  )
}
