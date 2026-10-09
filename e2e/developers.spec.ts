import { test, expect } from '@playwright/test'
import { attachScreenshots, expectNoSeriousA11yViolations, useTheme } from './support/site'

const DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'

test.describe('/developers', () => {
  test('renders the guide with a table of contents and highlighted code', async ({ page }) => {
    const response = await page.goto('/developers')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Build with Renown' })).toBeVisible()
    const mainNav = page.getByRole('banner').getByRole('navigation', { name: 'Main' })
    await expect(mainNav.getByRole('link', { name: 'Developers' })).toHaveAttribute('aria-current', 'page')
    await expect(mainNav.getByRole('link', { name: 'Trust' })).not.toHaveAttribute('aria-current', 'page')
    const toc = page.getByRole('navigation', { name: 'On this page' })
    await expect(toc.getByRole('link')).toHaveCount(7)
    await expect(toc.getByRole('link', { name: 'Build a connect link' })).toHaveAttribute('href', '#builder')
    for (const param of ['connect', 'app', 'returnUrl', 'deeplink', 'expiresInDays']) {
      await expect(page.getByRole('rowheader', { name: param, exact: true })).toBeVisible()
    }
    await expect(page.locator('#sdk .shiki')).toHaveCount(5)
    await expect(page.getByText('https://switchboard.renown.vetra.io/api/@powerhousedao/renown-package/oidc', { exact: true })).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/developers$/)
  })

  test('the connect link builder validates live and builds a working link', async ({ page }) => {
    await page.goto('/developers')
    const output = page.getByTestId('connect-link-output')
    const copy = page.getByRole('button', { name: 'Copy link' })
    await expect(output).toHaveText('Enter a valid app DID to generate the link.')
    await expect(copy).toBeDisabled()

    const did = page.getByLabel('App DID')
    await did.fill('did:web:example.com')
    await expect(did).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('An app DID looks like did:key:z6Mk… (base58btc).')).toBeVisible()

    await did.fill(DID)
    await expect(did).toHaveAttribute('aria-invalid', 'false')
    await expect(output).toHaveText(`${new URL(page.url()).origin}/?connect=${encodeURIComponent(DID)}&expiresInDays=7`)
    await expect(copy).toBeEnabled()

    const returnUrl = page.getByLabel('Return URL (optional)')
    await returnUrl.fill('/relative')
    await expect(page.getByText('Use an absolute http(s) URL; the sign-in flow ignores anything else.')).toBeVisible()
    await expect(copy).toBeDisabled()
    await returnUrl.fill('https://app.example/cb')

    await page.getByRole('button', { name: '30 days' }).click()
    await expect(page.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Not the default, so the user confirms this validity explicitly.')).toBeVisible()
    await page.getByLabel('Days').fill('9999')
    await expect(page.getByText('Longer than the maximum: the flow will ask for 365 days.')).toBeVisible()
    await expect(output).toContainText('expiresInDays=365')

    const tryIt = page.getByRole('link', { name: 'Try it' })
    await expect(tryIt).toHaveAttribute('href', /^\/\?connect=/)
    await expect(tryIt).toHaveAttribute('target', '_blank')
  })

  test('copying announces "Copied"', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only here')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/developers')
    await page.getByLabel('App DID').fill(DID)
    await page.getByRole('button', { name: 'Copy link' }).click()
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(encodeURIComponent(DID))
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`has no serious axe violations (${theme})`, async ({ page }, testInfo) => {
      await useTheme(page, theme)
      await page.goto('/developers')
      await page.getByLabel('App DID').fill('not-a-did')
      await expectNoSeriousA11yViolations(page)
      await attachScreenshots(page, testInfo, `developers-${theme}`)
    })
  }
})
