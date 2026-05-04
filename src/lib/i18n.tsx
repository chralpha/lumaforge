import type { PropsWithChildren } from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import enMessages from '~/locales/en.json'
import zhMessages from '~/locales/zh-CN.json'

const LOCALE_STORAGE_KEY = 'lumaforge.locale'

export const supportedLocales = ['en', 'zh-CN'] as const
export type Locale = (typeof supportedLocales)[number]

type MessageKey = keyof typeof enMessages

const typedZhMessages: Record<MessageKey, string> = zhMessages

const messages: Record<Locale, Record<MessageKey, string>> = {
  en: enMessages,
  'zh-CN': typedZhMessages,
}

export type Translate = (
  key: MessageKey,
  values?: Record<string, string | number>,
) => string

export interface I18nValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
  t: Translate
}

const I18nContext = createContext<I18nValue | null>(null)

function isLocale(value: string | null | undefined): value is Locale {
  return value === 'en' || value === 'zh-CN'
}

export function normalizeLocale(value: string | null | undefined) {
  if (!value) return null

  const normalized = value.trim().toLowerCase()
  if (normalized === 'zh-cn' || normalized.startsWith('zh')) return 'zh-CN'
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en'
  return null
}

function readStoredLocale() {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocale(stored) ? stored : normalizeLocale(stored)
  } catch {
    return null
  }
}

function readBrowserLocale() {
  if (typeof navigator === 'undefined') return null

  const languages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language]

  for (const language of languages) {
    const locale = normalizeLocale(language)
    if (locale) return locale
  }

  return null
}

export function resolveInitialLocale(): Locale {
  return readStoredLocale() ?? readBrowserLocale() ?? 'en'
}

function interpolate(
  message: string,
  values?: Record<string, string | number>,
) {
  if (!values) return message

  return message.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key]
    return value === undefined ? match : String(value)
  })
}

function createI18nValue(locale: Locale, setLocale: (locale: Locale) => void) {
  const t: Translate = (key, values) =>
    interpolate(messages[locale][key] ?? messages.en[key], values)

  return {
    locale,
    setLocale,
    toggleLocale: () => setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN'),
    t,
  } satisfies I18nValue
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale)
  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale)
  }, [])
  const value = useMemo(
    () => createI18nValue(locale, setLocale),
    [locale, setLocale],
  )

  useEffect(() => {
    document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en'

    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      // Locale persistence is optional; rendering should still continue.
    }
  }, [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  const [fallbackLocale, setFallbackLocale] =
    useState<Locale>(resolveInitialLocale)
  const fallbackValue = useMemo(
    () => createI18nValue(fallbackLocale, setFallbackLocale),
    [fallbackLocale],
  )

  return context ?? fallbackValue
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
