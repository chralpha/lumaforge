import { existsSync } from 'node:fs'
import process from 'node:process'

import type { Page } from '@playwright/test'
import { devices, expect, test } from '@playwright/test'

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

async function loadRawFixtureViaSameOriginDrop(
  page: Page,
  fixtureUrl: string,
  fileName: string,
) {
  return page.evaluate(
    async ({ fixtureUrl, fileName }) => {
      const response = await fetch(fixtureUrl)
      if (!response.ok) {
        return {
          ok: false,
          reason: `Fixture fetch returned ${response.status}`,
        } as const
      }

      const blob = await response.blob()
      const file = new File([blob], fileName, {
        type: 'application/octet-stream',
      })
      const transfer = new DataTransfer()
      transfer.items.add(file)

      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="file"]'),
      )
      const input =
        inputs.find((candidate) => {
          const accept = candidate.accept.toLowerCase()
          return (
            accept.includes('.nef') ||
            accept.includes('.arw') ||
            accept.includes('.dng') ||
            accept.includes('.raf')
          )
        }) ?? inputs[0]
      const target =
        input?.closest('label') ??
        input?.closest('[data-raw-lut]') ??
        input?.parentElement ??
        document.querySelector('[data-raw-lab-shell="viewport"]')

      if (!target) {
        return { ok: false, reason: 'RAW drop target not found' } as const
      }

      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          }),
        )
      }

      return { ok: true } as const
    },
    { fixtureUrl, fileName },
  )
}

async function dragSlider(page: Page, sliderName: string, targetRatio: number) {
  const slider = page.getByRole('slider', { name: sliderName })
  await expect(slider).toBeVisible()
  const box = await slider.boundingBox()
  const trackBox = await page
    .locator('[data-raw-compare-track="image"]')
    .boundingBox()
    .catch(() => null)
  const frameBox = await page
    .locator('[data-raw-preview-frame]')
    .boundingBox()
    .catch(() => null)

  expect(box).toBeTruthy()

  const before = Number(await slider.getAttribute('aria-valuenow'))
  const dragBox = trackBox ?? frameBox ?? box!
  const startX = box!.x + box!.width / 2
  const targetX = dragBox.x + dragBox.width * targetRatio
  const targetY = box!.y + box!.height / 2

  await page.mouse.move(startX, targetY)
  await page.mouse.down()
  await page.mouse.move(targetX, targetY, { steps: 12 })
  await page.mouse.up()

  await expect
    .poll(async () => Number(await slider.getAttribute('aria-valuenow')))
    .not.toBe(before)

  return {
    before,
    after: Number(await slider.getAttribute('aria-valuenow')),
  }
}

async function readCompareSplit(page: Page) {
  const slider = page.getByRole('slider', {
    name: 'Compare unprocessed RAW and final JPEG',
  })
  return Number(await slider.getAttribute('aria-valuenow'))
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

async function readLayerTransforms(page: Page) {
  return page.evaluate(() => {
    const processed = document.querySelector<HTMLElement>('.raw-preview-canvas')
    const original = document.querySelector<HTMLElement>(
      '.raw-preview-original-image, .raw-preview-original-webgl-canvas',
    )

    return {
      original: original ? getComputedStyle(original).transform : null,
      processed: processed ? getComputedStyle(processed).transform : null,
    }
  })
}

function expectViewportClose(
  actual: PreviewViewport,
  expected: PreviewViewport,
) {
  expect(actual.zoom).toBeCloseTo(expected.zoom, 2)
  expect(actual.panX).toBeCloseTo(expected.panX, 0)
  expect(actual.panY).toBeCloseTo(expected.panY, 0)
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
  const transforms = await readLayerTransforms(page)
  expect(transforms.original).toBeTruthy()
  expect(transforms.processed).toBe(transforms.original)

  const webglStats = await readWebglStats(page)

  if (mode === 'dual-webgl') {
    expect(webglStats.drawCalls).toBeLessThanOrEqual(2)
    expect(webglStats.finishCalls).toBe(0)
  }

  await page.mouse.dblclick(
    previewBox!.x + previewBox!.width * 0.2,
    previewBox!.y + previewBox!.height * 0.5,
  )
  await expect
    .poll(async () => (await readPreviewViewport(page)).zoom)
    .toBeCloseTo(1)
  expectViewportClose(await readPreviewViewport(page), {
    zoom: 1,
    panX: 0,
    panY: 0,
  })

  await testInfo.attach('raw-dual-layer-compare.json', {
    body: JSON.stringify({ mode, webglStats }, null, 2),
    contentType: 'application/json',
  })
})

test('keeps mobile-class JPEG fallback responsive through same-origin RAW drop and HQ upgrade', async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-desktop',
    'mobile-class fallback is exercised in a Chromium context with WebKit-class UA',
  )
  test.skip(
    !existsSync(RAW_COMPARE_FIXTURE),
    `Missing RAW compare fixture: ${RAW_COMPARE_FIXTURE}`,
  )
  testInfo.setTimeout(240_000)

  const baseURL =
    ((testInfo.project.use as { baseURL?: string }).baseURL ??
      'http://127.0.0.1:4178') + RAW_COMPARE_URL
  const context = await browser.newContext({
    ...devices['iPhone 14 Pro'],
    baseURL,
  })
  const page = await context.newPage()
  const fixtureName = RAW_COMPARE_FIXTURE.split('/').pop() ?? 'fixture.raw'
  const sameOriginFixtureUrl = `/__lumaforge-test-fixtures/${fixtureName}`

  try {
    await page.route(sameOriginFixtureUrl, async (route) => {
      await route.fulfill({
        path: RAW_COMPARE_FIXTURE,
        contentType: 'application/octet-stream',
      })
    })
    await installWebglCounters(page)
    await page.goto(baseURL)
    await expect(page.locator('[data-raw-lab-shell="viewport"]')).toBeVisible()

    const dropResult = await loadRawFixtureViaSameOriginDrop(
      page,
      sameOriginFixtureUrl,
      fixtureName,
    )
    test.skip(!dropResult.ok, dropResult.reason)

    await expect(
      page.locator('.raw-lab[data-raw-lab-state="loaded"]'),
    ).toBeVisible({ timeout: 90_000 })
    await page.getByRole('tab', { name: /^compare$/i }).click()
    await page.getByRole('button', { name: /^split compare$/i }).click()
    await expect
      .poll(() => readCompareMode(page), { timeout: 120_000 })
      .toBe('jpeg-fallback')

    const originalLayer = page.locator('.raw-preview-original-layer').first()
    await expect(originalLayer).toBeVisible()
    await expect(originalLayer).toHaveAttribute(
      'data-original-reference-source',
      /quick|bounded-hq/,
    )

    await waitForAnimationFrames(page, 3)
    await resetWebglStats(page)

    const split = await dragSlider(
      page,
      'Compare unprocessed RAW and final JPEG',
      0.72,
    )
    expect(split.after).toBeGreaterThan(split.before)

    const previewFrame = page.locator('[data-raw-preview-frame]')
    const previewBox = await previewFrame.boundingBox()
    expect(previewBox).toBeTruthy()

    await page.mouse.move(
      previewBox!.x + previewBox!.width * 0.45,
      previewBox!.y + previewBox!.height * 0.4,
    )
    await page.mouse.wheel(0, -1000)
    await expect
      .poll(async () => (await readPreviewViewport(page)).zoom)
      .toBeGreaterThan(1)

    const panBefore = await readPreviewViewport(page)
    await page.mouse.down()
    await page.mouse.move(
      previewBox!.x + previewBox!.width * 0.62,
      previewBox!.y + previewBox!.height * 0.6,
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

    const transforms = await readLayerTransforms(page)
    expect(transforms.original).toBeTruthy()
    expect(transforms.processed).toBe(transforms.original)

    const splitAfterInteraction = await readCompareSplit(page)
    const viewportAfterInteraction = await readPreviewViewport(page)
    await expect(originalLayer).toHaveAttribute(
      'data-original-reference-source',
      'bounded-hq',
      { timeout: 120_000 },
    )
    expect(await readCompareSplit(page)).toBe(splitAfterInteraction)
    expectViewportClose(
      await readPreviewViewport(page),
      viewportAfterInteraction,
    )

    const webglStats = await readWebglStats(page)
    expect(webglStats.drawCalls).toBeLessThanOrEqual(2)
    expect(webglStats.finishCalls).toBe(0)

    await testInfo.attach('raw-mobile-jpeg-fallback-compare.json', {
      body: JSON.stringify(
        {
          mode: await readCompareMode(page),
          splitAfterInteraction,
          viewportAfterInteraction,
          webglStats,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    })
  } finally {
    await context.close()
  }
})
