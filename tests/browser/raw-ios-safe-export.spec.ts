import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { resolveRawFixture } from './raw-export-fixtures'

type ExportDebugEvent = {
  type: string
  payload: Record<string, unknown>
}

type ExpectedProjectPlan = {
  profile: string
  preferredRows: number[]
  concurrency: number
  runtimeMemoryProfile: string
  checkpointMode: string
  outputSink: string
  checkpointExpected: boolean
}

function getExpectedProjectPlan(projectName: string): ExpectedProjectPlan {
  if (projectName === 'chromium-desktop') {
    return {
      profile: 'desktop-fast',
      preferredRows: [512, 1024],
      concurrency: 2,
      runtimeMemoryProfile: 'desktop',
      checkpointMode: 'safe-retry',
      outputSink: 'blob-handoff',
      checkpointExpected: false,
    }
  }

  return {
    profile: 'ios-safe',
    preferredRows: [64, 128],
    concurrency: 1,
    runtimeMemoryProfile: 'low-memory',
    checkpointMode: 'safe-retry',
    outputSink: 'opfs-file',
    checkpointExpected: true,
  }
}

async function collectExportEvents(page: Page) {
  return (await page.evaluate(() => {
    return (
      (window as unknown as { __LUMAFORGE_EXPORT_EVENTS__?: unknown[] })
        .__LUMAFORGE_EXPORT_EVENTS__ ?? []
    )
  })) as ExportDebugEvent[]
}

function eventPayload(events: ExportDebugEvent[], type: string) {
  return events.find((event) => event.type === type)?.payload ?? null
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

test('browser preflight records expected export profile before export', async ({
  page,
}, testInfo) => {
  const fixture = resolveRawFixture(testInfo)
  const expectedPlan = getExpectedProjectPlan(testInfo.project.name)

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
    const requiredEventTypes = [
      'export-plan-selected',
      'resource-evacuated',
      'export-worker-attempt',
      ...(expectedPlan.checkpointExpected ? ['checkpoint-written'] : []),
    ]
    await expect
      .poll(async () => {
        const eventTypes = new Set(
          (await collectExportEvents(page)).map((event) => event.type),
        )
        return requiredEventTypes.every((type) => eventTypes.has(type))
      })
      .toBe(true)

    const events = await collectExportEvents(page)
    const planPayload = eventPayload(events, 'export-plan-selected')
    expect(planPayload).toMatchObject({
      profile: expectedPlan.profile,
      concurrency: expectedPlan.concurrency,
      runtimeMemoryProfile: expectedPlan.runtimeMemoryProfile,
      checkpointMode: expectedPlan.checkpointMode,
      outputSink: expectedPlan.outputSink,
    })
    expect(expectedPlan.preferredRows).toContain(planPayload?.preferredRows)

    const evacuationPayload = eventPayload(events, 'resource-evacuated')
    expect(evacuationPayload).toMatchObject({
      profile: expectedPlan.profile,
      registryCheck: { ok: true },
      remainingLive: [],
    })

    if (expectedPlan.profile === 'desktop-fast') {
      expect(evacuationPayload?.requiredOwners).toEqual(['export-result'])
    } else {
      expect(evacuationPayload?.requiredOwners).toEqual([
        'preview',
        'bounded-hq',
        'webgl',
        'export-result',
        'lut-fetch',
      ])
    }

    const workerAttemptPayload = eventPayload(events, 'export-worker-attempt')
    expect(workerAttemptPayload).toMatchObject({
      attempt: 1,
      profile: expectedPlan.profile,
      phase: 'started',
      freshWorker: true,
    })

    if (expectedPlan.checkpointExpected) {
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'checkpoint-written',
        }),
      )
    }
  } finally {
    await testInfo.attach('export-events.json', {
      body: JSON.stringify(await collectExportEvents(page), null, 2),
      contentType: 'application/json',
    })
  }
})
