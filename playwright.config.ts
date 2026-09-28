import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3400',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Own port so a plain `pnpm dev` on :3000 (without the mock wallet) is never reused.
  webServer: [
    {
      command: 'anvil --port 8545 --silent',
      port: 8545,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm dev --port 3400',
      url: 'http://localhost:3400',
      env: { NEXT_PUBLIC_E2E_MOCK_WALLET: '1' },
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
})
