import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Runs in the Playwright worker (Node). A deployment's settings reach the app
// only through lib/runtime-config.ts: a file that reads one of their baked
// names directly would keep the build's value whatever the deployment sets.
const ROOT = join(__dirname, '..')
const SETTINGS =
  /NEXT_PUBLIC_(RENOWN_URL|SWITCHBOARD_ENDPOINT|RENOWN_OIDC_ISSUER|CONNECT_URL|PRIVY_APP_ID|PRIVY_CLIENT_ID|VITE_WALLET_CONNECT_PROJECT_ID|VITE_INFURA_PROJECT_ID|OPENPANEL_CLIENT_ID|OPENPANEL_API_URL|RENOWN_DRIVE_ID)\b/
// The module itself, and the tests, which set up the dev server they run against.
const ALLOWED = ['lib/runtime-config.ts', 'playwright.config.ts']
const SKIPPED_DIRS = new Set(['node_modules', '.next', '.git', 'e2e', 'docs', '.superpowers', 'test-results', 'playwright-report'])

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return SKIPPED_DIRS.has(name) ? [] : sources(path)
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [relative(ROOT, path)] : []
  })
}

test('no file but the config module reads a setting by its baked name', () => {
  const readers = sources(ROOT).filter((file) => !ALLOWED.includes(file) && SETTINGS.test(readFileSync(join(ROOT, file), 'utf8')))
  expect(readers).toEqual([])
})
