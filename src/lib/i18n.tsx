import i18n from 'i18next'
import type { PropsWithChildren } from 'react'
import { I18nextProvider, useTranslation } from 'react-i18next'

import enMessages from '~/locales/en.json'
import zhMessages from '~/locales/zh-CN.json'

const LOCALE_STORAGE_KEY = 'lumaforge.locale'

export const supportedLocales = ['en', 'zh-CN'] as const
export type Locale = (typeof supportedLocales)[number]

type MessageKey = keyof typeof enMessages

export type Translate = (
  key: MessageKey,
  values?: Record<string, string | number>,
) => string

function resolveInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored === 'en' || stored === 'zh-CN') return stored
  } catch {}

  if (typeof navigator !== 'undefined') {
    const languages = navigator.languages?.length
      ? navigator.languages
      : [navigator.language]
    for (const lang of languages) {
      const normalized = lang?.trim().toLowerCase()
      if (normalized === 'zh-cn' || normalized?.startsWith('zh')) return 'zh-CN'
      if (normalized === 'en' || normalized?.startsWith('en-')) return 'en'
    }
  }

  return 'en'
}

i18n.init({
  resources: {
    en: { translation: enMessages },
    'zh-CN': { translation: zhMessages },
  },
  lng: resolveInitialLocale(),
  fallbackLng: 'en',
  supportedLngs: supportedLocales,
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
  returnEmptyString: false,
})

export function useI18n() {
  const { t, i18n: i18nInstance, ready } = useTranslation()

  if (!ready) {
    const locale = resolveInitialLocale()
    const messages = locale === 'zh-CN' ? zhMessages : enMessages
    return {
      locale,
      setLocale: (_locale: Locale) => {},
      toggleLocale: () => {},
      t: ((key: MessageKey, values?: Record<string, string | number>) => {
        let message = messages[key] ?? enMessages[key] ?? key
        if (values) {
          for (const [k, v] of Object.entries(values)) {
            message = message.replace(`{{${k}}}`, String(v))
          }
        }
        return message
      }) as Translate,
    }
  }

  return {
    locale: (i18nInstance.resolvedLanguage ?? resolveInitialLocale()) as Locale,
    setLocale: (locale: Locale) => {
      i18nInstance.changeLanguage(locale)
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, locale)
      } catch {}
    },
    toggleLocale: () => {
      const current =
        (i18nInstance.resolvedLanguage as Locale) ?? resolveInitialLocale()
      const next = current === 'zh-CN' ? 'en' : 'zh-CN'
      i18nInstance.changeLanguage(next)
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, next)
      } catch {}
    },
    t: t as Translate,
  }
}

export function I18nProvider({ children }: PropsWithChildren) {
  const locale = resolveInitialLocale()

  if (i18n.resolvedLanguage !== locale) {
    i18n.changeLanguage(locale)
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}

export function localizeRawReason(reason: string | undefined, t: Translate) {
  if (!reason) return reason

  if (reason === enMessages['raw.exportSourceLoading']) {
    return t('raw.exportSourceLoading')
  }

  if (reason === enMessages['raw.unsupported.webgl2']) {
    return t('raw.unsupported.webgl2')
  }

  if (reason === enMessages['raw.export.copyUnsupported']) {
    return t('raw.export.copyUnsupported')
  }

  if (reason === enMessages['raw.export.copyPreviewReason']) {
    return t('raw.export.copyPreviewReason')
  }

  if (reason === enMessages['raw.export.shareUnsupported']) {
    return t('raw.export.shareUnsupported')
  }

  return reason
}

export function localizeCopyLabel(label: string, t: Translate) {
  if (label === enMessages['raw.export.copyFull'])
    return t('raw.export.copyFull')
  if (label === enMessages['raw.export.copyPreview']) {
    return t('raw.export.copyPreview')
  }

  return label
}
