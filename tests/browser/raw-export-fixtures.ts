import { existsSync } from 'node:fs'
import process from 'node:process'

import type { TestInfo } from '@playwright/test'

export function resolveRawFixture(testInfo: TestInfo) {
  const fixture =
    process.env.LUMAFORGE_100MP_RAF ??
    '/workspaces/LumaForge/test-images/Fujifilm - GFX100RF - 16bit lossless compressed (4_3).RAF'

  if (!existsSync(fixture)) {
    testInfo.skip(
      true,
      `Set LUMAFORGE_100MP_RAF to a local 100MP RAF fixture. Missing: ${fixture}`,
    )
  }

  return fixture
}
