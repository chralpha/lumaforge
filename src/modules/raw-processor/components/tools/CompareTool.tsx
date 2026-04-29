import { Button } from '~/components/ui/button'

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
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={onCompareReset}
      >
        Reset compare view
      </Button>
    </ToolSection>
  )
}
