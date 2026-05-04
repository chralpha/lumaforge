import { useI18n } from '~/lib/i18n'

export function SupportBadge({
  level,
}: {
  level: 'official' | 'experimental'
}) {
  const { t } = useI18n()

  return (
    <span
      className={
        level === 'official'
          ? 'rounded-full bg-green/10 px-2 py-1 text-xs text-green'
          : 'rounded-full bg-yellow/10 px-2 py-1 text-xs text-yellow'
      }
    >
      {level === 'official'
        ? t('raw.support.official')
        : t('raw.support.experimental')}
    </span>
  )
}
