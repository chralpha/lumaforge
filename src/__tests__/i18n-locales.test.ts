import { describe, expect, it } from 'vitest'

import enMessages from '~/locales/en.json'
import zhMessages from '~/locales/zh-CN.json'

describe('i18n locale catalogs', () => {
  it('keeps English and Chinese translation keys in JSON locale files', () => {
    expect(Object.keys(zhMessages).sort()).toEqual(
      Object.keys(enMessages).sort(),
    )
    expect(enMessages['landing.kicker']).toBe('Browser RAW finishing lab')
    expect(zhMessages['landing.kicker']).toBe('浏览器里的 RAW 成片工作台')
  })
})
