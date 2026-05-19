import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

function createIdentityCube(title: string, size = 17) {
  const lines = [`TITLE "${title}"`, `LUT_3D_SIZE ${size}`]
  const step = 1 / (size - 1)

  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        lines.push(
          `${(r * step).toFixed(6)} ${(g * step).toFixed(6)} ${(
            b * step
          ).toFixed(6)}`,
        )
      }
    }
  }

  return lines.join('\n')
}

function createCatalogFixture() {
  const cube = createIdentityCube('Catalog Fixture')
  const bytes = Buffer.byteLength(cube)
  const sha256 = createHash('sha256').update(cube).digest('hex')
  const primaryAsset = {
    url: 'https://example.com/audit-rec709.cube',
    role: 'cube-lut',
    mediaType: 'application/x-cube-lut',
    sha256,
    size: bytes,
    title: 'Audit Rec.709 Print',
  }

  return {
    cube,
    catalog: {
      schemaVersion: 1,
      entries: [
        {
          id: 'audit-rec709',
          kind: 'lut',
          version: '1.0.0',
          title: 'Audit Rec.709 Print',
          family: 'Print Film',
          license: 'CC0-1.0',
          redistributionAllowed: true,
          primaryAsset,
          entryUrl: 'https://example.com/entries/audit-rec709.json',
        },
      ],
    },
    entry: {
      schemaVersion: 1,
      id: 'audit-rec709',
      kind: 'lut',
      version: '1.0.0',
      format: 'cube',
      title: 'Audit Rec.709 Print',
      family: 'Print Film',
      license: 'CC0-1.0',
      redistributionAllowed: true,
      primaryAsset,
      entryUrl: 'https://example.com/entries/audit-rec709.json',
      lut: {
        intent: 'combined-look-output',
        input: {
          gamut: 's-gamut3-cine',
          transfer: 's-log3',
          range: 'full',
        },
        output: {
          gamut: 'rec709',
          transfer: 'gamma24',
          range: 'legal',
        },
      },
    },
  }
}

async function openRawToolsIfNeeded(page: Page) {
  if ((page.viewportSize()?.width ?? Number.POSITIVE_INFINITY) > 640) return

  const toolsTab = page.getByRole('button', { name: 'Tools' })
  const sheet = page.locator('.raw-mobile-tool-sheet')

  await expect(toolsTab).toBeVisible()
  await toolsTab.click()
  await expect(sheet).toBeVisible()
  await expect(page.locator('.raw-mobile-tool-sheet-header h2')).toHaveText(
    'Tools',
  )
}

test('closes the online LUT resource browser when its trigger is clicked again', async ({
  page,
}) => {
  await page.goto(
    `/raw?luts=${encodeURIComponent('https://example.com/valid.cube')}`,
  )
  await openRawToolsIfNeeded(page)

  const trigger = page.getByRole('button', { name: 'Open valid.cube' })
  await expect(trigger).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')

  await trigger.click()

  await expect(
    page.getByRole('dialog', { name: 'valid.cube LUTs' }),
  ).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')

  await trigger.click()

  await expect(
    page.getByRole('dialog', { name: 'valid.cube LUTs' }),
  ).toHaveCount(0)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

test('closes the online LUT resource browser after a rapid repeated trigger click', async ({
  page,
}) => {
  await page.goto(
    `/raw?luts=${encodeURIComponent('https://example.com/rapid.cube')}`,
  )
  await openRawToolsIfNeeded(page)

  const trigger = page.getByRole('button', { name: 'Open rapid.cube' })
  await expect(trigger).toBeVisible()

  await trigger.dblclick()

  await expect(
    page.getByRole('dialog', { name: 'rapid.cube LUTs' }),
  ).toHaveCount(0)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

test('closes the LUT contract browser when its trigger is clicked again', async ({
  page,
}, testInfo) => {
  const cubePath = testInfo.outputPath('unknown-validation.cube')
  await writeFile(cubePath, createIdentityCube('Unknown Validation'), 'utf8')
  await page.goto('/raw')

  await page
    .locator('input[type="file"][accept=".cube"]')
    .first()
    .setInputFiles(cubePath)
  await openRawToolsIfNeeded(page)

  const trigger = page.getByRole('button', { name: 'Change LUT contract' })
  await expect(trigger).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')

  await trigger.click()

  await expect(
    page.getByRole('dialog', { name: 'LUT contract browser' }),
  ).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')

  await trigger.click()

  await expect(
    page.getByRole('dialog', { name: 'LUT contract browser' }),
  ).toHaveCount(0)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

test('keeps the LUT contract browser options inside its scroll frame on desktop', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-desktop',
    'desktop anchored contract browser regression',
  )

  const cubePath = testInfo.outputPath('contract-browser-scroll.cube')
  await writeFile(
    cubePath,
    createIdentityCube('Contract Browser Scroll'),
    'utf8',
  )
  await page.goto('/raw')

  await page
    .locator('input[type="file"][accept=".cube"]')
    .first()
    .setInputFiles(cubePath)

  const trigger = page.getByRole('button', { name: 'Change LUT contract' })
  await expect(trigger).toBeVisible()
  await trigger.click()

  const browser = page.getByRole('dialog', { name: 'LUT contract browser' })
  await expect(browser).toBeVisible()

  const metrics = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>(
      '[data-raw-lut-browser-dialog="contract"]',
    )
    const list = document.querySelector<HTMLElement>(
      '[data-raw-lut="contract-browser-list"]',
    )
    const toolSurface = document.querySelector<HTMLElement>('.raw-tool-surface')

    return {
      dialog: dialog?.getBoundingClientRect().toJSON(),
      list: list?.getBoundingClientRect().toJSON(),
      listOverflowY: list ? getComputedStyle(list).overflowY : '',
      placement: dialog?.getAttribute('data-lut-source-placement'),
      toolSurface: toolSurface?.getBoundingClientRect().toJSON(),
    }
  })

  expect(metrics.dialog).toBeTruthy()
  expect(metrics.list).toBeTruthy()
  expect(metrics.toolSurface).toBeTruthy()
  expect(metrics.placement).toBe('sidecar')
  expect(metrics.dialog!.width).toBeGreaterThanOrEqual(500)
  expect(metrics.dialog!.right).toBeLessThanOrEqual(
    metrics.toolSurface!.left - 8,
  )
  expect(metrics.listOverflowY).toBe('auto')
  expect(metrics.list!.bottom).toBeLessThanOrEqual(metrics.dialog!.bottom + 1)
})

test('keeps sparse online LUT resource entries compact on desktop', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-desktop',
    'desktop anchored online resource browser regression',
  )

  const fixture = createCatalogFixture()

  await page.route('https://example.com/catalog.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(fixture.catalog),
    }),
  )
  await page.route('https://example.com/entries/audit-rec709.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(fixture.entry),
    }),
  )
  await page.route('https://example.com/audit-rec709.cube', (route) =>
    route.fulfill({
      contentType: 'text/plain',
      body: fixture.cube,
    }),
  )

  await page.goto(
    `/raw?luts=${encodeURIComponent('https://example.com/catalog.json')}`,
  )

  const trigger = page.getByRole('button', {
    name: 'Open Catalog from example.com',
  })
  await expect(trigger).toBeVisible()
  await trigger.click()

  const browser = page.getByRole('dialog', {
    name: 'Catalog from example.com LUTs',
  })
  await expect(browser).toBeVisible()

  const metrics = await page.evaluate(() => {
    const entry = document.querySelector<HTMLElement>(
      '[data-raw-lut="source-entry"]',
    )
    const dialog = document.querySelector<HTMLElement>(
      '[data-raw-lut-browser-dialog="source"]',
    )
    const list = document.querySelector<HTMLElement>(
      '[data-raw-lut="source-browser-list"]',
    )
    const toolSurface = document.querySelector<HTMLElement>('.raw-tool-surface')

    return {
      dialog: dialog?.getBoundingClientRect().toJSON(),
      entry: entry?.getBoundingClientRect().toJSON(),
      list: list?.getBoundingClientRect().toJSON(),
      listAlignContent: list ? getComputedStyle(list).alignContent : '',
      placement: dialog?.getAttribute('data-lut-source-placement'),
      toolSurface: toolSurface?.getBoundingClientRect().toJSON(),
    }
  })

  expect(metrics.dialog).toBeTruthy()
  expect(metrics.list).toBeTruthy()
  expect(metrics.entry).toBeTruthy()
  expect(metrics.toolSurface).toBeTruthy()
  expect(metrics.placement).toBe('sidecar')
  expect(metrics.dialog!.width).toBeGreaterThanOrEqual(500)
  expect(metrics.dialog!.right).toBeLessThanOrEqual(
    metrics.toolSurface!.left - 8,
  )
  expect(['start', 'flex-start']).toContain(metrics.listAlignContent)
  expect(metrics.dialog!.height).toBeLessThanOrEqual(280)
  expect(metrics.entry!.height).toBeLessThanOrEqual(56)

  await browser
    .getByRole('button', { name: 'Load Audit Rec.709 Print' })
    .click()
  await expect(browser).toHaveCount(0)
  await expect(page.getByText('LUT input:')).toBeVisible()
  await expect(page.getByText('s-gamut3-cine / s-log3')).toBeVisible()
  await expect(page.getByText('LUT output:')).toBeVisible()
  await expect(page.getByText('Rec.709 display')).toBeVisible()
  await expect(page.getByText('LUT intent is unsupported')).toHaveCount(0)
})
