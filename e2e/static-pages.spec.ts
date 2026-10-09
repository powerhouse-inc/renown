import { test, expect } from '@playwright/test'
import { attachScreenshots, expectNoSeriousA11yViolations, useTheme } from './support/site'

test.describe('/trust', () => {
  test('every claim links to its source code', async ({ page }) => {
    await page.goto('/trust')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check how Renown works, not just what we say')
    const claims = page.locator('ol > li[id]')
    await expect(claims).toHaveCount(5)
    for (const claim of await claims.all()) {
      await expect(claim.getByRole('link', { name: /source code/ })).toHaveAttribute('href', /^https:\/\/github\.com\/powerhouse-inc\//)
    }
    await expect(page.getByRole('heading', { name: 'Never held' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Your Renown' })).toHaveAttribute('href', '/me')
  })
})

test.describe('/ecosystem', () => {
  test('describes the five systems and draws the identity flow', async ({ page }) => {
    await page.goto('/ecosystem')
    for (const name of ['Renown', 'Vetra', 'Achra', 'Connect', 'Switchboard']) {
      await expect(page.locator(`#${name.toLowerCase()}`).getByRole('heading', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('img', { name: 'How a Renown identity flows through the Powerhouse network' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Visit Achra' })).toHaveAttribute('href', 'https://www.achra.com')
  })
})

test.describe('mobile drawer navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  // Starts on a real page: in `next dev`, a 404 page reloads itself when another route compiles.
  test('a drawer link navigates and closes the drawer', async ({ page }) => {
    await page.goto('/ecosystem')
    // Dev-mode route chunks are still loading right after `load`; a click before then is dropped.
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Open menu' }).click()
    const drawer = page.getByRole('dialog', { name: 'Menu' })
    await expect(drawer.getByRole('link', { name: 'Ecosystem' })).toHaveAttribute('aria-current', 'page')
    await drawer.getByRole('link', { name: 'Trust' }).click()
    await expect(page).toHaveURL(/\/trust$/, { timeout: 30_000 })
    await expect(drawer).toBeHidden()
  })
})

test.describe('error pages', () => {
  test('an unknown path is a designed, unindexed 404', async ({ page }) => {
    const response = await page.goto('/no-such-page')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'This page is not on the network' })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.getByRole('link', { name: 'Go to the homepage' })).toHaveAttribute('href', '/')
    await expect(page.getByRole('banner')).toBeVisible()
  })
})

for (const path of ['/trust', '/ecosystem', '/no-such-page']) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${path} has no serious axe violations (${theme})`, async ({ page }, testInfo) => {
      await useTheme(page, theme)
      await page.goto(path)
      await expectNoSeriousA11yViolations(page)
      await attachScreenshots(page, testInfo, `${path.slice(1)}-${theme}`)
    })
  }
}
