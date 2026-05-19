import { expect, test } from '@playwright/test'

test('keeps RAW Lab tool scrolling inside the viewport shell', async ({
  page,
}) => {
  await page.goto('/raw')
  await expect(page.locator('[data-raw-lab-shell="viewport"]')).toBeVisible()

  const metrics = await page.evaluate(() => {
    const documentRoot = document.documentElement
    const rawShell = document.querySelector<HTMLElement>(
      '[data-raw-lab-shell="viewport"]',
    )
    const toolStack = document.querySelector<HTMLElement>('.raw-tool-stack')
    const mobileRail = document.querySelector<HTMLElement>(
      '.raw-mobile-tool-rail',
    )
    const mobileSheet = document.querySelector<HTMLElement>(
      '.raw-mobile-tool-sheet',
    )

    return {
      documentScrollOverflow:
        documentRoot.scrollHeight - documentRoot.clientHeight,
      rawShellHeight: rawShell?.getBoundingClientRect().height ?? 0,
      rawShellScrollOverflow: rawShell
        ? rawShell.scrollHeight - rawShell.clientHeight
        : 0,
      toolStackScrollOverflow: toolStack
        ? toolStack.scrollHeight - toolStack.clientHeight
        : 0,
      toolStackOverflowY: toolStack
        ? getComputedStyle(toolStack).overflowY
        : '',
      isMobile: window.innerWidth <= 640,
      mobileRailVisible: mobileRail
        ? getComputedStyle(mobileRail).display !== 'none'
        : false,
      mobileSheetClosed: mobileSheet
        ? mobileSheet.hidden || getComputedStyle(mobileSheet).display === 'none'
        : true,
      viewportHeight: window.innerHeight,
    }
  })

  expect(metrics.rawShellHeight).toBe(metrics.viewportHeight)
  expect(metrics.rawShellScrollOverflow).toBe(0)
  expect(metrics.documentScrollOverflow).toBe(0)

  if (metrics.isMobile) {
    expect(metrics.mobileRailVisible).toBe(true)
    expect(metrics.mobileSheetClosed).toBe(true)
  } else if (metrics.toolStackOverflowY === 'auto') {
    expect(metrics.toolStackScrollOverflow).toBeGreaterThan(0)
  }
})

test('opens the RAW picker from the empty desktop preview dock', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-desktop',
    'desktop preview dock regression',
  )

  await page.goto('/raw')
  await expect(page.locator('[data-raw-lab-shell="viewport"]')).toBeVisible()

  const uploadDock = page.getByRole('button', { name: /Drop one RAW here/ })
  await expect(uploadDock).toBeVisible()
  await expect(
    page.getByRole('slider', {
      name: 'Compare unprocessed RAW and final JPEG',
    }),
  ).toBeVisible()

  const fileChooserPromise = page.waitForEvent('filechooser')
  await uploadDock.click({ timeout: 3_000 })

  const fileChooser = await fileChooserPromise
  expect(fileChooser.isMultiple()).toBe(false)
})
