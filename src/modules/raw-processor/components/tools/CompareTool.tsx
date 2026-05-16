import { RotateCcw } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { useI18n } from '~/lib/i18n'

export function CompareTool({
  disabled,
  onCompareReset,
}: {
  disabled: boolean
  onCompareReset: () => void
}) {
  const { t } = useI18n()

  return (
    <div className="grid gap-3">
      <p className="text-callout text-text-secondary">
        {t('raw.compare.note')}
      </p>
      <Button
        variant="light"
        size="sm"
        disabled={disabled}
        onClick={onCompareReset}
      >
        <RotateCcw aria-hidden="true" />
        {t('raw.compare.reset')}
      </Button>
    </div>
  )
}
