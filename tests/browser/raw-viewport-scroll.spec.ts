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
      viewportHeight: window.innerHeight,
    }
  })

  expect(metrics.rawShellHeight).toBe(metrics.viewportHeight)
  expect(metrics.rawShellScrollOverflow).toBe(0)
  expect(metrics.documentScrollOverflow).toBe(0)

  if (metrics.toolStackOverflowY === 'auto') {
    expect(metrics.toolStackScrollOverflow).toBeGreaterThan(0)
  }
})
