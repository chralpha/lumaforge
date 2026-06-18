/**
 * Browser validation for the /raw slider chrome contract:
 *   • Directional gradient tracks (HSL three axes, Temperature, Tint)
 *   • Bipolar Range overlay (LrC-style "offset from neutral")
 *   • Cool-lift HSL axis tabs (segmented-chrome family)
 *   • Dirty data-attribute hook on tool rows
 *
 * The HSL smoke spec exercises the end-to-end data path through the same
 * components. This spec narrowly asserts the visual contract introduced
 * by the slider-tracks helper + Slider primitive upgrade, so a future
 * refactor that drops the gradient or the bipolar overlay fails CI.
 */

import { existsSync } from 'node:fs'
import process from 'node:process'

import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const RAW_FIXTURE =
  process.env.LUMAFORGE_SONY_ARW ??
  '/workspaces/LumaForge/test-images/SGL00940.ARW'

async function loadRawFixture(page: Page, fixture: string) {
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page
    .getByRole('button', { name: /finish a raw with a lut/i })
    .click({ position: { x: 24, y: 24 } })
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(fixture)
  await expect(
    page.locator('.raw-lab[data-raw-lab-state="loaded"]'),
  ).toBeVisible({ timeout: 90_000 })
}

async function dragSlider(
  page: Page,
  slider: Locator,
  ratioFromCenter: number,
) {
  await slider.scrollIntoViewIfNeeded()
  const box = await slider.boundingBox()
  expect(box).toBeTruthy()
  const startX = box!.x + box!.width / 2
  const startY = box!.y + box!.height / 2
  const targetX = box!.x + box!.width * (0.5 + ratioFromCenter)
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(targetX, startY, { steps: 10 })
  await page.mouse.up()
}

test('directional sliders carry gradient tracks and a bipolar Range overlay', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-desktop',
    'Slider chrome contract targets desktop Chromium only',
  )
  test.skip(!existsSync(RAW_FIXTURE), `Missing RAW fixture: ${RAW_FIXTURE}`)
  testInfo.setTimeout(180_000)

  await page.goto('/raw')
  await expect(page.locator('[data-raw-lab-shell="viewport"]')).toBeVisible()
  await loadRawFixture(page, RAW_FIXTURE)

  // ----- Color tool: Temperature has a gradient track + bipolar overlay -----
  const colorRegion = page.getByRole('region', { name: 'Color' }).first()
  await colorRegion.scrollIntoViewIfNeeded()
  await expect(colorRegion).toBeVisible()
  const tempRow = colorRegion.locator('[data-color-field="userTemperature"]')
  await expect(tempRow).toBeVisible()

  // Drag temperature to a non-zero value so dirty + bipolar overlay light up.
  const tempSlider = tempRow.getByRole('slider')
  await dragSlider(page, tempSlider, 0.18)
  await expect
    .poll(async () => Number(await tempSlider.getAttribute('aria-valuenow')))
    .not.toBe(0)
  await expect(tempRow).toHaveAttribute('data-dirty', '')

  // Track must carry a linear-gradient inline background (directional cue).
  const tempTrack = tempRow.locator('[data-slot="slider-track"]')
  await expect(tempTrack).toHaveAttribute('style', /linear-gradient/i)

  // Bipolar overlay must render as the data-bipolar slider-range slot.
  const tempBipolar = tempRow.locator(
    '[data-slot="slider-range"][data-bipolar]',
  )
  await expect(tempBipolar).toBeAttached()
  const tempOverlayWidth = await tempBipolar.evaluate(
    (el) => (el as HTMLElement).style.width,
  )
  expect(tempOverlayWidth).not.toBe('0%')

  // ----- HSL tool: axis tabs use the cool-lift idiom -----
  const hslRegion = page.getByRole('region', { name: 'HSL' }).first()
  await hslRegion.scrollIntoViewIfNeeded()
  const hueTab = hslRegion.getByRole('tab', { name: 'Hue' })
  await expect(hueTab).toHaveAttribute('aria-selected', 'true')
  // The selected axis tab paints itself with the cool near-white wash and an
  // inset top highlight — same lift idiom as the Strength segmented control.
  const hueTabClass = (await hueTab.getAttribute('class')) ?? ''
  expect(hueTabClass).toContain('bg-[oklch(0.96_0.006_255/0.10)]')
  expect(hueTabClass).toContain(
    'shadow-[inset_0_1px_0_oklch(0.96_0.006_255/0.14)]',
  )

  // ----- HSL: each band's Hue slider has a gradient track and bipolar overlay -----
  const redRow = hslRegion.locator('[data-hsl-band="red"]')
  const redTrack = redRow.locator('[data-slot="slider-track"]')
  await expect(redTrack).toHaveAttribute('style', /linear-gradient/i)
  await expect(
    redRow.locator('[data-slot="slider-range"][data-bipolar]'),
  ).toBeAttached()

  // Switching the active axis swaps the underlying gradient. Saturation
  // builds its gradient from `l 0 h` (gray) → band; lightness from
  // `0.30 c h` (dark band) → `0.88 c h` (light band). Both signatures
  // are stable identifiers we can grep for in the inline style.
  await hslRegion.getByRole('tab', { name: 'Saturation' }).click()
  await expect(redTrack).toHaveAttribute('style', /l 0 h/i)

  await hslRegion.getByRole('tab', { name: 'Lightness' }).click()
  await expect(redTrack).toHaveAttribute('style', /0\.30 c h/i)
  await expect(redTrack).toHaveAttribute('style', /0\.88 c h/i)
})
