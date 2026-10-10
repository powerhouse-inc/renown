import { test, expect, type Page } from '@playwright/test'
import { signInTestWallet } from './support/test-session'

// The wallet stack (Privy, wagmi, RainbowKit, WalletConnect/Reown) loads only on
// the wallet routes (components/wallet/lazy-wallet-shell.tsx). The production
// build enforces the same for every marketing page (scripts/check-wallet-chunks.mjs).
// The e2e server is `next dev`, whose chunks name every module by its path:
// these are the wallet modules' paths (library docs comments, e.g. viem's
// `['wagmi', 420n]` examples, would make plain library names match).
const WALLET_MARKERS = [
  '/node_modules/.pnpm/@privy-io+',
  '/node_modules/.pnpm/wagmi@',
  '/node_modules/.pnpm/@rainbow-me+rainbowkit@',
  '/node_modules/.pnpm/@walletconnect+',
  '/node_modules/.pnpm/@reown+',
  '/services/wallet/',
  '/auth-providers/',
]

/** Every script the page downloaded while loading, by URL → body. */
async function collectScripts(page: Page): Promise<Map<string, Promise<string>>> {
  const scripts = new Map<string, Promise<string>>()
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') scripts.set(response.url(), response.text().catch(() => ''))
  })
  return scripts
}

async function walletScripts(scripts: Map<string, Promise<string>>): Promise<string[]> {
  const found: string[] = []
  for (const [url, body] of scripts) {
    const text = await body
    const markers = WALLET_MARKERS.filter((marker) => text.includes(marker))
    if (markers.length) found.push(`${url}: ${markers.join(', ')}`)
  }
  return found
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000)
  // Nothing leaves localhost (ENS, wallet relays, analytics).
  await page.route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), (route) => route.abort())
})

for (const path of ['/', '/apps', '/developers']) {
  test(`${path} downloads no wallet code`, async ({ page }) => {
    const scripts = await collectScripts(page)
    await page.goto(path)
    await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 30_000 })
    await page.waitForLoadState('networkidle')
    expect(scripts.size).toBeGreaterThan(0)
    expect(await walletScripts(scripts)).toEqual([])
  })
}

test('header Sign in leads to the sign-in flow, which loads the wallet stack there', async ({ page }) => {
  await page.goto('/apps')
  const scripts = await collectScripts(page)
  await page.getByRole('banner').getByRole('button', { name: 'Sign in' }).click({ timeout: 30_000 })
  await expect(page).toHaveURL(/[?&]app=.*[&]connect=|[?&]connect=.*[&]app=/)
  await expect(page.getByRole('heading', { name: 'Connect Wallet' })).toBeVisible({ timeout: 30_000 })
  expect((await walletScripts(scripts)).length).toBeGreaterThan(0)
})

test('/?app= renders the sign-in flow', async ({ page }) => {
  await page.goto('/?app=did:web:split.example')
  await expect(page.getByRole('heading', { name: 'Connect Wallet' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(0)
})

test('moving between wallet routes in the app keeps the wallet session', async ({ page }) => {
  await signInTestWallet(page, { bearer: 'e2e-split-bearer' })
  await page.goto('/me')
  await expect(page.getByRole('heading', { level: 2, name: 'Connected apps' })).toBeVisible({ timeout: 30_000 })
  // A client-side navigation unmounts /me's wallet shell and mounts /profile/edit's.
  await page.evaluate(() => (window as unknown as { next: { router: { push: (url: string) => Promise<boolean> } } }).next.router.push('/profile/edit'))
  await expect(page).toHaveURL(/\/profile\/edit$/)
  await expect(page.getByRole('heading', { name: 'Edit profile' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('main').getByRole('button', { name: 'Sign in' })).toHaveCount(0)
})

test('when the wallet code cannot be downloaded, the sign-in page says so and offers a reload', async ({ page }) => {
  // e.g. a deploy replaced the chunks, or the connection dropped. next dev names
  // the chunk after its module (components/wallet/wallet-shell.tsx).
  await page.route(/wallet-shell/, (route) => route.abort())
  await page.goto('/?app=did:web:split.example')
  await expect(page.getByRole('alert').filter({ hasText: 'Sign-in could not load' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()
})
