import { test, expect, type Page } from '@playwright/test'
import { installInjectedWallet } from './support/injected-wallet'

// Browser-level: the app and console flows with an injected test wallet. The
// credential POST and read are answered in the browser (nothing reaches the
// shared stub switchboard), so these tests can run in parallel with the rest.

interface IssuedCredential {
  credential: { id: string; credentialSubject: unknown; issuanceDate: string; expirationDate: string }
}

const DAY_MS = 24 * 60 * 60 * 1000

async function interceptCredentialApi(page: Page): Promise<() => IssuedCredential | null> {
  // Nothing leaves localhost: ENS lookups fail fast, so the flow has no ENS name.
  await page.route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), (route) => route.abort())
  await installInjectedWallet(page)
  let issued: IssuedCredential | null = null
  await page.route('**/api/credential/renown', async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 405, json: {} })
    issued = route.request().postDataJSON()
    await route.fulfill({ json: { userDocumentId: 'doc-validity' } })
  })
  await page.route('**/api/auth/credential?*', (route) =>
    issued
      ? route.fulfill({
          json: { credential: { id: issued.credential.id, credentialSubject: issued.credential.credentialSubject } },
        })
      : route.fulfill({ status: 404, json: { error: 'Credential not found' } }),
  )
  return () => issued
}

function validityDays(issued: IssuedCredential | null): number {
  if (!issued) throw new Error('no credential was issued')
  const ms = Date.parse(issued.credential.expirationDate) - Date.parse(issued.credential.issuanceDate)
  return Math.round(ms / DAY_MS)
}

test.beforeEach(() => {
  test.setTimeout(90_000)
})

test.describe('app flow credential validity', () => {
  const APP_DID = 'did:key:z6MkValidityTestApp'
  const returnUrl = encodeURIComponent('http://localhost:3000/done')
  const flowUrl = (extra = '') => `/?app=${APP_DID}&returnUrl=${returnUrl}${extra}`

  test('a requested validity is shown before confirming and signed into the credential', async ({ page }) => {
    const issued = await interceptCredentialApi(page)
    await page.goto(flowUrl('&expiresInDays=365'))

    const confirm = page.getByRole('button', { name: 'Confirm Authorization' })
    await expect(confirm).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/^Valid for 365 days, until /)).toBeVisible()

    await confirm.click()
    await expect(page.getByRole('button', { name: 'Revoke' })).toBeVisible({ timeout: 30_000 })
    expect(validityDays(issued())).toBe(365)
    // returnUrl handling is unchanged.
    await expect(page.getByRole('link', { name: /Return to localhost/ })).toHaveAttribute(
      'href',
      /^http:\/\/localhost:3000\/done\?user=did/,
      { timeout: 30_000 },
    )
  })

  test('a validity above the maximum is clamped to 365 days', async ({ page }) => {
    const issued = await interceptCredentialApi(page)
    await page.goto(flowUrl('&expiresInDays=5000'))

    await expect(page.getByText(/^Valid for 365 days, until /)).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Confirm Authorization' }).click()
    await expect(page.getByRole('button', { name: 'Revoke' })).toBeVisible({ timeout: 30_000 })
    expect(validityDays(issued())).toBe(365)
  })

  test('without the parameter the credential keeps the 7-day default and no notice is shown', async ({ page }) => {
    const issued = await interceptCredentialApi(page)
    await page.goto(flowUrl())

    const confirm = page.getByRole('button', { name: 'Confirm Authorization' })
    await expect(confirm).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/^Valid for \d+ days?, until /)).toHaveCount(0)

    await confirm.click()
    await expect(page.getByRole('button', { name: 'Revoke' })).toBeVisible({ timeout: 30_000 })
    expect(validityDays(issued())).toBe(7)
  })

  test('an invalid value falls back to the 7-day default', async ({ page }) => {
    const issued = await interceptCredentialApi(page)
    await page.goto(flowUrl('&expiresInDays=abc'))

    const confirm = page.getByRole('button', { name: 'Confirm Authorization' })
    await expect(confirm).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/^Valid for \d+ days?, until /)).toHaveCount(0)
    await confirm.click()
    await expect(page.getByRole('button', { name: 'Revoke' })).toBeVisible({ timeout: 30_000 })
    expect(validityDays(issued())).toBe(7)
  })
})

test.describe('console flow credential validity', () => {
  const CLI_DID = 'did:key:z6MkValidityTestCli'

  test('a requested validity is shown before authorizing and signed into the credential', async ({ page }) => {
    const issued = await interceptCredentialApi(page)
    const sessionId = `validity-${Date.now()}`
    await page.goto(`/console?session=${sessionId}&connect=${CLI_DID}&expiresInDays=90`)

    const authorize = page.getByRole('button', { name: 'Authorize CLI' })
    await expect(authorize).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/^Valid for 90 days, until /)).toBeVisible()

    await authorize.click()
    await expect(page.getByText('Authorization Complete')).toBeVisible({ timeout: 30_000 })
    expect(validityDays(issued())).toBe(90)
  })

  test('without the parameter the console credential keeps the 7-day default', async ({ page }) => {
    const issued = await interceptCredentialApi(page)
    const sessionId = `validity-default-${Date.now()}`
    await page.goto(`/console?session=${sessionId}&connect=${CLI_DID}`)

    const authorize = page.getByRole('button', { name: 'Authorize CLI' })
    await expect(authorize).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/^Valid for \d+ days?, until /)).toHaveCount(0)
    await authorize.click()
    await expect(page.getByText('Authorization Complete')).toBeVisible({ timeout: 30_000 })
    expect(validityDays(issued())).toBe(7)
  })
})
