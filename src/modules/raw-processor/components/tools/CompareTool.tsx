import { RotateCcw } from 'lucide-react'

import { ToolSection } from './ToolSection'

export function CompareTool({
  disabled,
  onCompareReset,
}: {
  disabled: boolean
  onCompareReset: () => void
}) {
  return (
    <ToolSection title="Compare" eyebrow="Split">
      <p className="raw-tool-note">Drag the split directly on the image.</p>
      <button
        type="button"
        className="raw-tool-reset-button"
        disabled={disabled}
        onClick={onCompareReset}
      >
        <RotateCcw aria-hidden="true" />
        Reset compare view
      </button>
    </ToolSection>
  )
}
