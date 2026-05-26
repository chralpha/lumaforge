import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const rawLabCss = readFileSync(
  resolve(process.cwd(), 'src/modules/raw-processor/raw-lab.css'),
  'utf8',
)

function extractRuleBody(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`)
  expect(start).toBeGreaterThanOrEqual(0)

  const bodyStart = css.indexOf('{', start) + 1
  let depth = 1
  for (let index = bodyStart; index < css.length; index += 1) {
    const char = css[index]
    if (char === '{') {
      depth += 1
    }
    if (char === '}') {
      depth -= 1
    }
    if (depth === 0) {
      return css.slice(bodyStart, index)
    }
  }

  throw new Error(`Could not find end of rule for ${selector}`)
}

function extractCustomProperties(ruleBody: string) {
  const entries: Array<[string, string]> = []

  for (const line of ruleBody.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('--')) {
      continue
    }

    const separator = trimmed.indexOf(':')
    if (separator === -1) {
      continue
    }

    const name = trimmed.slice(0, separator)
    const value = trimmed
      .slice(separator + 1)
      .replace(/;$/, '')
      .trim()
    entries.push([name, value])
  }

  return Object.fromEntries(entries)
}

describe('raw lab css tokens', () => {
  it('keeps desktop and mobile preview mats on their own design languages', () => {
    const desktopTokens = extractCustomProperties(
      extractRuleBody(rawLabCss, '.raw-lab'),
    )
    const mobileMedia = extractRuleBody(rawLabCss, '@media (max-width: 640px)')
    const mobileTokens = extractCustomProperties(
      extractRuleBody(mobileMedia, '.raw-lab'),
    )

    expect(desktopTokens['--color-preview-mat']).toBe('oklch(0.9 0.024 86)')
    expect(desktopTokens['--color-preview-mat-edge']).toBe(
      'oklch(0.82 0.026 82)',
    )
    expect(mobileTokens['--color-preview-mat']).toBe(
      'var(--color-stage-background)',
    )
    expect(mobileTokens['--color-preview-mat-edge']).toBe('var(--color-fill)')
    expect(mobileTokens['--color-preview-border']).toBe('transparent')
  })

  it('fixes the mobile shell while the iOS toolbar nudge creates page scroll', () => {
    const mobileMedia = extractRuleBody(rawLabCss, '@media (max-width: 640px)')
    const nudgeBodyRule = extractRuleBody(
      mobileMedia,
      'html[data-raw-ios-toolbar-nudge] body',
    )
    const nudgeShellRule = extractRuleBody(
      mobileMedia,
      'html[data-raw-ios-toolbar-nudge] [data-raw-lab-shell="viewport"]',
    )

    expect(nudgeBodyRule).toContain('min-height: calc(100dvh + 192px);')
    expect(nudgeShellRule).toContain('position: fixed;')
    expect(nudgeShellRule).toContain('inset: 0;')
    expect(nudgeShellRule).toContain('top: 0;')
    expect(nudgeShellRule).toContain('width: 100%;')
    expect(nudgeShellRule).toContain('height: 100dvh;')
  })
})
