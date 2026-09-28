import { defineConfig, devices } from '@playwright/test'
import { STUB_SWITCHBOARD_PORT, STUB_SWITCHBOARD_URL } from './e2e/support/stub-switchboard-client'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Stand-in switchboard for the API-route tests (e2e/support/stub-switchboard.mjs).
      command: `node e2e/support/stub-switchboard.mjs`,
      url: `${STUB_SWITCHBOARD_URL}/health`,
      env: { STUB_SWITCHBOARD_PORT: String(STUB_SWITCHBOARD_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000',
      // A reused dev server must also point at the stub switchboard, or the
      // credential API tests fail.
      env: { NEXT_PUBLIC_SWITCHBOARD_ENDPOINT: `${STUB_SWITCHBOARD_URL}/graphql` },
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
})
