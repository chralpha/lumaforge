import { existsSync } from 'node:fs'
import process from 'node:process'

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const RAW_COMPARE_FIXTURE =
  process.env.LUMAFORGE_RAW_COMPARE_FIXTURE ??
  '/workspaces/LumaForge/test-images/SGL_1998.NEF'
const RAW_COMPARE_URL = process.env.LUMAFORGE_RAW_COMPARE_URL ?? '/raw'

type LayeredCompareMode = 'dual-webgl' | 'jpeg-fallback'

type PreviewViewport = {
  zoom: number
  panX: number
  panY: number
}

type WebglStats = {
  drawCalls: number
  finishCalls: number
  flushCalls: number
  resetAt: number
}

async function installWebglCounters(page: Page) {
  await page.addInitScript(() => {
    type CounterWindow = Window & {
      __LUMAFORGE_COMPARE_WEBGL_STATS__?: WebglStats
      __LUMAFORGE_COMPARE_WEBGL_RESET__?: () => void
    }
    type PatchedFunction = ((...args: unknown[]) => unknown) & {
      __lumaforgeComparePatched?: true
    }

    const stats: WebglStats = {
      drawCalls: 0,
      finishCalls: 0,
      flushCalls: 0,
      resetAt: performance.now(),
    }
    const counterWindow = window as CounterWindow

    counterWindow.__LUMAFORGE_COMPARE_WEBGL_STATS__ = stats
    counterWindow.__LUMAFORGE_COMPARE_WEBGL_RESET__ = () => {
      stats.drawCalls = 0
      stats.finishCalls = 0
      stats.flushCalls = 0
      stats.resetAt = performance.now()
    }

    function patchMethod(
      prototype: object | undefined,
      method: string,
      counter: keyof Pick<
        WebglStats,
        'drawCalls' | 'finishCalls' | 'flushCalls'
      >,
    ) {
      if (!prototype) return

      const target = prototype as Record<string, unknown>
      const original = target[method]
      if (typeof original !== 'function') return
      if ((original as PatchedFunction).__lumaforgeComparePatched) return

      const wrapped: PatchedFunction = function (
        this: unknown,
        ...args: unknown[]
      ) {
        stats[counter] += 1
        return Reflect.apply(original, this, args)
      }
      wrapped.__lumaforgeComparePatched = true
      target[method] = wrapped
    }

    const webglPrototypes = [
      typeof WebGLRenderingContext === 'undefined'
        ? undefined
        : WebGLRenderingContext.prototype,
      typeof WebGL2RenderingContext === 'undefined'
        ? undefined
        : WebGL2RenderingContext.prototype,
    ]

    for (const prototype of webglPrototypes) {
      patchMethod(prototype, 'drawArrays', 'drawCalls')
      patchMethod(prototype, 'drawElements', 'drawCalls')
      patchMethod(prototype, 'finish', 'finishCalls')
      patchMethod(prototype, 'flush', 'flushCalls')
    }
  })
}

async function loadRawFixture(page: Page, fixture: string) {
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page
    .getByRole('button', { name: /drop one raw here/i })
    .click({ position: { x: 24, y: 24 } })
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(fixture)
}

async function dragSlider(page: Page, sliderName: string, targetRatio: number) {
  const slider = page.getByRole('slider', { name: sliderName })
  await expect(slider).toBeVisible()
  const box = await slider.boundingBox()

  expect(box).toBeTruthy()

  const before = Number(await slider.getAttribute('aria-valuenow'))

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    box!.x + box!.width * targetRatio,
    box!.y + box!.height / 2,
    { steps: 12 },
  )
  await page.mouse.up()

  await expect
    .poll(async () => Number(await slider.getAttribute('aria-valuenow')))
    .not.toBe(before)

  return {
    before,
    after: Number(await slider.getAttribute('aria-valuenow')),
  }
}

async function readPreviewViewport(page: Page): Promise<PreviewViewport> {
  return page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(
      '[data-raw-preview-surface]',
    )

    if (!surface) {
      return { zoom: 1, panX: 0, panY: 0 }
    }

    const style = getComputedStyle(surface)

    return {
      zoom: Number.parseFloat(style.getPropertyValue('--raw-preview-zoom')),
      panX: Number.parseFloat(style.getPropertyValue('--raw-preview-pan-x')),
      panY: Number.parseFloat(style.getPropertyValue('--raw-preview-pan-y')),
    }
  })
}

async function readCompareMode(page: Page) {
  return page
    .locator('[data-compare-mode]')
    .first()
    .getAttribute('data-compare-mode')
    .catch(() => null)
}

async function waitForLayeredCompareMode(
  page: Page,
): Promise<LayeredCompareMode> {
  await expect
    .poll(
      async () => {
        return (await readCompareMode(page)) ?? 'missing'
      },
      { timeout: 90_000 },
    )
    .toMatch(/^(dual-webgl|jpeg-fallback)$/)

  return (await readCompareMode(page)) as LayeredCompareMode
}

async function resetWebglStats(page: Page) {
  await page.evaluate(() => {
    ;(
      window as Window & {
        __LUMAFORGE_COMPARE_WEBGL_RESET__?: () => void
      }
    ).__LUMAFORGE_COMPARE_WEBGL_RESET__?.()
  })
}

async function readWebglStats(page: Page): Promise<WebglStats> {
  return page.evaluate(() => {
    return (
      (
        window as Window & {
          __LUMAFORGE_COMPARE_WEBGL_STATS__?: WebglStats
        }
      ).__LUMAFORGE_COMPARE_WEBGL_STATS__ ?? {
        drawCalls: 0,
        finishCalls: 0,
        flushCalls: 0,
        resetAt: 0,
      }
    )
  })
}

async function waitForAnimationFrames(page: Page, count: number) {
  await page.evaluate(async (frameCount) => {
    for (let index = 0; index < frameCount; index += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    }
  }, count)
}

test('keeps dual-layer RAW compare usable through split zoom and pan', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-desktop',
    'dual WebGL compare path is a desktop Chromium regression target',
  )
  test.skip(
    !existsSync(RAW_COMPARE_FIXTURE),
    `Missing RAW compare fixture: ${RAW_COMPARE_FIXTURE}`,
  )
  testInfo.setTimeout(180_000)

  await installWebglCounters(page)
  await page.goto(RAW_COMPARE_URL)
  await expect(page.locator('[data-raw-lab-shell="viewport"]')).toBeVisible()

  await loadRawFixture(page, RAW_COMPARE_FIXTURE)

  await expect(
    page.locator('.raw-lab[data-raw-lab-state="loaded"]'),
  ).toBeVisible({ timeout: 90_000 })
  await expect(page.getByRole('slider', { name: 'Exposure' })).toBeVisible()

  const mode = await waitForLayeredCompareMode(page)
  const compareLayer = page.locator(`[data-compare-mode="${mode}"]`).first()
  await expect(compareLayer).toBeVisible()

  if (mode === 'dual-webgl') {
    await expect(
      page.locator('.raw-preview-original-webgl-canvas'),
    ).toHaveCount(1)
  } else {
    await expect(page.locator('.raw-preview-original-image')).toBeVisible()
  }

  await waitForAnimationFrames(page, 3)
  await resetWebglStats(page)

  const split = await dragSlider(
    page,
    'Compare unprocessed RAW and final JPEG',
    0.82,
  )
  expect(split.after).toBeGreaterThan(split.before)
  await expect(compareLayer).toHaveAttribute('data-compare-mode', mode)

  const previewFrame = page.locator('[data-raw-preview-frame]')
  const previewBox = await previewFrame.boundingBox()

  expect(previewBox).toBeTruthy()

  await page.mouse.move(
    previewBox!.x + previewBox!.width * 0.35,
    previewBox!.y + previewBox!.height * 0.4,
  )
  await page.mouse.wheel(0, -1200)

  await expect
    .poll(async () => (await readPreviewViewport(page)).zoom)
    .toBeGreaterThan(1)

  const panBefore = await readPreviewViewport(page)

  await page.mouse.down()
  await page.mouse.move(
    previewBox!.x + previewBox!.width * 0.56,
    previewBox!.y + previewBox!.height * 0.62,
    { steps: 12 },
  )
  await page.mouse.up()

  await expect
    .poll(async () => {
      const next = await readPreviewViewport(page)

      return (
        Math.abs(next.panX - panBefore.panX) +
        Math.abs(next.panY - panBefore.panY)
      )
    })
    .toBeGreaterThan(0)
  await expect(compareLayer).toHaveAttribute('data-compare-mode', mode)

  const webglStats = await readWebglStats(page)

  if (mode === 'dual-webgl') {
    expect(webglStats.drawCalls).toBeLessThanOrEqual(2)
    expect(webglStats.finishCalls).toBe(0)
  }

  await testInfo.attach('raw-dual-layer-compare.json', {
    body: JSON.stringify({ mode, webglStats }, null, 2),
    contentType: 'application/json',
  })
})
