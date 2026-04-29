import { Button } from '~/components/ui/button'

import { ToolSection } from './ToolSection'

export function ExportTool({
  canExport,
  disabledReason,
  isProcessing,
  onExport,
}: {
  canExport: boolean
  disabledReason: string
  isProcessing: boolean
  onExport: (options: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
  }) => void
}) {
  return (
    <ToolSection title="Export" eyebrow="Full-res JPEG">
      <Button
        variant="primary"
        size="sm"
        className="w-full"
        disabled={!canExport || isProcessing}
        onClick={() => onExport({ quality: 'high', fidelity: 'balanced' })}
      >
        Export full-resolution JPEG
      </Button>
      <p className="raw-tool-note">
        {canExport
          ? 'Exports from the LibRaw processed-window path.'
          : disabledReason}
      </p>
    </ToolSection>
  )
}
