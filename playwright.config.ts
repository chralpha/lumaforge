import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  webServer: {
    command: 'pnpm build && pnpm serve --host 127.0.0.1 --port 4178',
    url: 'http://127.0.0.1:4178/raw',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'webkit-ios-safe',
      use: {
        ...devices['iPhone 14 Pro'],
        browserName: 'webkit',
        baseURL: 'http://127.0.0.1:4178',
      },
    },
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        baseURL: 'http://127.0.0.1:4178',
      },
    },
  ],
})
