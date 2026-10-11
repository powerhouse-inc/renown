import { test, expect, type Page } from '@playwright/test'
import { expectNoSeriousA11yViolations } from './support/site'

// The header notices when the browser wallet (window.ethereum) switches to
// another account than the Renown session's, and offers to sign in as it or
// to stay. The Renown session is stood in for by window.__renownE2eSession
// (NEXT_PUBLIC_E2E_AUTH=1, components/site/use-site-auth.ts).
const OLD = '0x5e00000000000000000000000000000000005a01'
const NEW = '0x5e00000000000000000000000000000000005a02'
const OTHER = '0x5e00000000000000000000000000000000005a03'
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`
const PAGE = '/trust'

interface Setup {
  /** The Renown session's address; none = signed out. */
  session?: string
  /** The wallet's accounts; null = no injected wallet. */
  accounts: string[] | null
  /** This browser's wallet was already seen on the session's account (an earlier visit). */
  paired?: boolean
  /** The session's sign-out rejects. */
  logoutFails?: boolean
}

/** A minimal EIP-1193 wallet whose account the test can switch, plus the session stand-in. */
async function setUp(page: Page, { session, accounts, paired, logoutFails }: Setup): Promise<void> {
  await page.addInitScript(
    ({ session, accounts, paired, logoutFails }) => {
      type Listener = (accounts: string[]) => void
      const w = window as unknown as Record<string, unknown>
      w.__walletCalls = 0
      w.__ethereumReads = 0
      if (session) w.__renownE2eSession = { address: session, calls: [] as string[], logoutFails }
      if (session && paired) localStorage.setItem(`renown:injected-session:${session.toLowerCase()}`, '1')
      if (!accounts) return
      let current = accounts
      const listeners: Listener[] = []
      const ethereum = {
        request: async ({ method }: { method: string }) => {
          w.__walletCalls = (w.__walletCalls as number) + 1
          if (method === 'eth_accounts') return current
          throw Object.assign(new Error(`Unsupported method ${method}`), { code: 4200 })
        },
        on: (event: string, listener: Listener) => event === 'accountsChanged' && listeners.push(listener),
        removeListener: (event: string, listener: Listener) => {
          const i = listeners.indexOf(listener)
          if (i >= 0) listeners.splice(i, 1)
        },
      }
      Object.defineProperty(window, 'ethereum', {
        configurable: true,
        get: () => {
          w.__ethereumReads = (w.__ethereumReads as number) + 1
          return ethereum
        },
      })
      // Switches silently (no event), like a wallet changed while the tab was in the background.
      w.__setAccounts = (next: string[]) => (current = next)
      w.__switchAccounts = (next: string[]) => {
        current = next
        listeners.forEach((listener) => listener(next))
      }
    },
    { session, accounts, paired, logoutFails },
  )
}

const prompt = (page: Page) => page.getByRole('region', { name: 'Wallet account changed' })
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __renownE2eSession: { calls: string[] } }).__renownE2eSession.calls)

async function ready(page: Page): Promise<void> {
  await page.goto(PAGE)
  await expect(page.getByRole('banner').getByRole('button', { name: /^Account menu for / })).toBeVisible({ timeout: 30_000 })
}

test('no prompt while the wallet shows the signed-in account', async ({ page }) => {
  await setUp(page, { session: OLD, accounts: [OLD] })
  await ready(page)
  await page.waitForTimeout(500)
  await expect(prompt(page)).toHaveCount(0)
})

test('switching accounts in the wallet asks, and never signs out by itself', async ({ page }) => {
  await setUp(page, { session: OLD, accounts: [OLD] })
  await ready(page)
  await page.evaluate((next) => (window as unknown as { __switchAccounts: (a: string[]) => void }).__switchAccounts([next]), NEW)
  await expect(prompt(page)).toContainText(`You switched to ${short(NEW)} in your wallet. You are signed in as ${short(OLD)}.`)
  expect(await calls(page)).toEqual([])
  await prompt(page).getByRole('button', { name: `Sign in as ${short(NEW)}` }).click()
  await expect.poll(() => calls(page)).toEqual(['logout', 'login'])
})

test('Stay keeps the session and hides the prompt for that account, also after a reload', async ({ page }) => {
  // The wallet was seen on the session's account on an earlier visit, and has switched since.
  await setUp(page, { session: OLD, accounts: [NEW], paired: true })
  await ready(page)
  await expect(prompt(page)).toBeVisible() // checked on mount, no event needed
  await prompt(page).getByRole('button', { name: `Stay as ${short(OLD)}` }).click()
  await expect(prompt(page)).toHaveCount(0)
  // Focus goes back to the header, not to the page body.
  await expect(page.getByRole('banner').getByRole('button', { name: /^Account menu for / })).toBeFocused()
  expect(await calls(page)).toEqual([])
  await page.reload()
  await expect(page.getByRole('banner').getByRole('button', { name: /^Account menu for / })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(500)
  await expect(prompt(page)).toHaveCount(0)
  // A different account asks again.
  await page.evaluate((next) => (window as unknown as { __switchAccounts: (a: string[]) => void }).__switchAccounts([next]), OTHER)
  await expect(prompt(page)).toContainText(`You switched to ${short(OTHER)}`)
})

test('a session made with another wallet never prompts: the wallet was never seen on its account', async ({ page }) => {
  // e.g. signed in with email (Privy) while MetaMask still has this site authorised for another account.
  await setUp(page, { session: OLD, accounts: [NEW] })
  await ready(page)
  await page.waitForTimeout(500)
  await expect(prompt(page)).toHaveCount(0)
  await page.evaluate((next) => (window as unknown as { __switchAccounts: (a: string[]) => void }).__switchAccounts([next]), OTHER)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(500)
  await expect(prompt(page)).toHaveCount(0)
  // A new tab of the same browser does not prompt either.
  await page.reload()
  await expect(page.getByRole('banner').getByRole('button', { name: /^Account menu for / })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(500)
  await expect(prompt(page)).toHaveCount(0)
})

test('once seen on the session account, a later switch also asks in a new tab', async ({ page }) => {
  await setUp(page, { session: OLD, accounts: [OLD] })
  await ready(page)
  await page.evaluate((next) => (window as unknown as { __setAccounts: (a: string[]) => void }).__setAccounts([next]), NEW)
  const other = await page.context().newPage()
  await setUp(other, { session: OLD, accounts: [NEW] })
  await ready(other)
  await expect(prompt(other)).toContainText(`You switched to ${short(NEW)}`)
})

test('when signing out fails, the prompt says so and does not start a sign-in', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await setUp(page, { session: OLD, accounts: [OLD], logoutFails: true })
  await ready(page)
  await page.evaluate((next) => (window as unknown as { __switchAccounts: (a: string[]) => void }).__switchAccounts([next]), NEW)
  await prompt(page).getByRole('button', { name: `Sign in as ${short(NEW)}` }).click()
  await expect(prompt(page)).toContainText('Could not sign out. Try again.')
  await expectNoSeriousA11yViolations(page)
  await page.waitForTimeout(300)
  expect(await calls(page)).toEqual(['logout'])
  expect(errors).toEqual([])
})

test('a switch made while the tab was in the background shows when the window regains focus', async ({ page }) => {
  await setUp(page, { session: OLD, accounts: [OLD] })
  await ready(page)
  await page.evaluate((next) => (window as unknown as { __setAccounts: (a: string[]) => void }).__setAccounts([next]), NEW)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(prompt(page)).toContainText(`You switched to ${short(NEW)}`)
})

test('a locked wallet (no accounts) or no injected wallet never prompts', async ({ page }) => {
  await setUp(page, { session: OLD, accounts: [] })
  await ready(page)
  await page.evaluate(() => (window as unknown as { __switchAccounts: (a: string[]) => void }).__switchAccounts([]))
  await page.waitForTimeout(500)
  await expect(prompt(page)).toHaveCount(0)

  const other = await page.context().newPage()
  const errors: string[] = []
  other.on('pageerror', (error) => errors.push(error.message))
  await setUp(other, { session: OLD, accounts: null })
  await ready(other)
  await other.waitForTimeout(500)
  await expect(prompt(other)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('signed-out visitors: the wallet is not even asked', async ({ page }) => {
  await setUp(page, { accounts: [NEW] })
  await page.goto(PAGE)
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(500)
  await expect(prompt(page)).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { __walletCalls: number }).__walletCalls)).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { __ethereumReads: number }).__ethereumReads)).toBe(0)
})
