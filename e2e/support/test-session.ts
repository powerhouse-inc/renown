// A signed-in visitor for /me under NEXT_PUBLIC_E2E_AUTH=1: the injected test
// wallet connects on the sign-in screen (no credential is issued), and the
// wallet session then stands in for the Renown session (components/me/use-me-session.ts).
import { expect, type Page } from '@playwright/test'
import { installInjectedWallet, type InjectedWallet } from './injected-wallet'

export async function signInTestWallet(page: Page, options: { bearer?: string } = {}): Promise<InjectedWallet> {
  // Nothing leaves localhost (ENS, wallet relays).
  await page.route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), (route) => route.abort())
  if (options.bearer) {
    await page.addInitScript((bearer) => {
      ;(window as { __renownE2eBearer?: string }).__renownE2eBearer = bearer
    }, options.bearer)
  }
  const wallet = await installInjectedWallet(page)
  await page.goto('/?app=did:web:me.example')
  await expect(page.getByRole('button', { name: 'Confirm Authorization' })).toBeVisible({ timeout: 30_000 })
  return wallet
}
