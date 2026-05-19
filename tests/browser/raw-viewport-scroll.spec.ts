import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

const RAW_FIXTURE = '/workspaces/LumaForge/test-images/SGL_1998.NEF'

function createIdentityCube(title: string) {
  return [
    `TITLE "${title}"`,
    'LUT_3D_SIZE 2',
    '0 0 0',
    '1 0 0',
    '0 1 0',
    '1 1 0',
    '0 0 1',
    '1 0 1',
    '0 1 1',
    '1 1 1',
  ].join('\n')
}

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

test('keeps desktop RAW load toasts out of the persistent export action lane', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-desktop',
    'desktop export action lane regression',
  )
  test.skip(!existsSync(RAW_FIXTURE), `Missing RAW fixture: ${RAW_FIXTURE}`)

  await page.goto('/raw')
  await expect(page.locator('[data-raw-lab-shell="viewport"]')).toBeVisible()

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page
    .getByRole('button', { name: /drop one raw here/i })
    .click({ position: { x: 24, y: 24 } })
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(RAW_FIXTURE)

  const exportButton = page
    .getByRole('region', { name: 'Export' })
    .first()
    .getByRole('button', { name: /export full-resolution jpeg/i })
    .first()
  await expect(exportButton).toBeEnabled({ timeout: 60_000 })

  const cubePath = testInfo.outputPath('toast-lane.cube')
  await writeFile(cubePath, createIdentityCube('Toast Lane'), 'utf8')
  await page
    .locator('input[type="file"][accept=".cube"]')
    .first()
    .setInputFiles(cubePath)
  await expect(page.locator('[data-sonner-toast]').first()).toBeVisible()

  const metrics = await page.evaluate(() => {
    const button = document
      .querySelector('[data-raw-export-block="persistent"] button')
      ?.getBoundingClientRect()
    const toast = document
      .querySelector('[data-sonner-toast]')
      ?.getBoundingClientRect()

    return {
      button: button?.toJSON(),
      toast: toast?.toJSON(),
    }
  })

  expect(metrics.button).toBeTruthy()
  expect(metrics.toast).toBeTruthy()
  expect(metrics.toast!.right).toBeLessThanOrEqual(metrics.button!.left)
})
