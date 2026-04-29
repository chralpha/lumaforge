import { Button } from '~/components/ui/button'

import type {
  ExportResult,
  ExportShareCapability,
} from '../../model/export-result'
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
  onShareExport: () => void
  onDownloadExport: () => void
  onCopyExport: () => void
}) {
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
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              disabled={!exportShareCapability.available}
              onClick={onShareExport}
            >
              Share
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={onDownloadExport}
            >
              Download
            </Button>
            {exportResult.copyCapability.mode === 'unavailable' ? (
              <Button variant="secondary" size="sm" className="w-full" disabled>
                Copy
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={onCopyExport}
              >
                {exportResult.copyCapability.label}
              </Button>
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
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            disabled={!canExport || isProcessing}
            onClick={() => onExport({ quality: 'high', fidelity: 'balanced' })}
          >
            {isProcessing ? 'Preparing JPEG...' : 'Export full-resolution JPEG'}
          </Button>
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
