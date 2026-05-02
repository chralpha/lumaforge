import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { resolveRawFixture } from './raw-export-fixtures'

type ExportDebugEvent = {
  type: string
  payload: Record<string, unknown>
}

async function collectExportEvents(page: Page) {
  return (await page.evaluate(() => {
    return (
      (window as unknown as { __LUMAFORGE_EXPORT_EVENTS__?: unknown[] })
        .__LUMAFORGE_EXPORT_EVENTS__ ?? []
    )
  })) as ExportDebugEvent[]
}

async function openRawToolsIfCollapsed(page: Page) {
  const rawToolsToggle = page.getByRole('button', { name: /^raw tools$/i })
  if (await rawToolsToggle.isVisible()) {
    const expanded = await rawToolsToggle.getAttribute('aria-expanded')
    if (expanded !== 'true') {
      await rawToolsToggle.click()
    }
  }
}

test('WebKit mobile preflight selects ios-safe before export', async ({
  page,
}, testInfo) => {
  const fixture = resolveRawFixture(testInfo)

  await page.addInitScript(() => {
    window.addEventListener('lumaforge-export-debug', (event) => {
      const custom = event as CustomEvent
      ;(
        window as unknown as { __LUMAFORGE_EXPORT_EVENTS__: unknown[] }
      ).__LUMAFORGE_EXPORT_EVENTS__ ??= []
      ;(
        window as unknown as { __LUMAFORGE_EXPORT_EVENTS__: unknown[] }
      ).__LUMAFORGE_EXPORT_EVENTS__.push(custom.detail)
    })
  })

  await page.goto('/raw')

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page
    .getByRole('button', { name: /drop one raw here/i })
    .click({ position: { x: 24, y: 24 } })
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(fixture)

  await openRawToolsIfCollapsed(page)

  const unsupportedBrowserBuild = page
    .getByText(
      /full-resolution jpeg export is not available in this browser build/i,
    )
    .first()
  const exportButton = page
    .getByRole('button', { name: /export full-resolution jpeg/i })
    .first()
  await expect
    .poll(
      async () => {
        if (await unsupportedBrowserBuild.isVisible()) return 'unsupported'
        if (
          (await exportButton.isVisible()) &&
          (await exportButton.isEnabled())
        ) {
          return 'ready'
        }
        return 'waiting'
      },
      { timeout: 60_000 },
    )
    .toMatch(/ready|unsupported/)

  if (await unsupportedBrowserBuild.isVisible()) {
    testInfo.skip(
      true,
      'This Playwright WebKit browser build cannot expose processed-window full-resolution export for this fixture.',
    )
  }

  await expect(exportButton).toBeEnabled({ timeout: 60_000 })
  await exportButton.click()

  try {
    await expect
      .poll(async () => collectExportEvents(page))
      .toContainEqual(
        expect.objectContaining({
          type: 'export-plan-selected',
          payload: expect.objectContaining({
            profile: 'ios-safe',
            concurrency: 1,
            checkpointMode: 'safe-retry',
          }),
        }),
      )
  } finally {
    testInfo.attach('export-events.json', {
      body: JSON.stringify(await collectExportEvents(page), null, 2),
      contentType: 'application/json',
    })
  }
})
