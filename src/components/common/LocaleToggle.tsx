import { Languages } from 'lucide-react'

import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

export function LocaleToggle({ className }: { className?: string }) {
  const { locale, toggleLocale, t } = useI18n()
  const label =
    locale === 'zh-CN'
      ? t('common.switchToEnglish')
      : t('common.switchToChinese')
  const shortLabel =
    locale === 'zh-CN' ? t('common.localeEnglish') : t('common.localeChinese')

  return (
    <button
      type="button"
      className={clsxm(
        'locale-toggle rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        className,
      )}
      aria-label={label}
      title={label}
      onClick={toggleLocale}
    >
      <Languages aria-hidden="true" size={16} strokeWidth={1.9} />
      <span>{shortLabel}</span>
    </button>
  )
}
