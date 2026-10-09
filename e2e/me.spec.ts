import { test, expect, type Page, type Route } from '@playwright/test'
import { verifyMessage } from 'viem'
import { revokeMessage } from '../services/renown-signed-messages'
import { attachScreenshots, expectNoSeriousA11yViolations, useTheme } from './support/site'
import { STUB_SWITCHBOARD_URL } from './support/stub-switchboard-client'
import { signInTestWallet } from './support/test-session'

// /me reads and revokes from the browser, so each test answers the switchboard
// itself (page.route): parallel-safe, no shared stub state.
const DAY = 86_400_000
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString()
const ALPHA = `did:key:z6MkMeAlpha${'a'.repeat(36)}`
const BETA = `did:key:z6MkMeBeta${'b'.repeat(37)}`
const CLI = `did:key:z6MkMeCli${'c'.repeat(38)}`

interface Revoke {
  variables: Record<string, unknown>
  authorization: string | undefined
}
type RevokeAnswer = { status?: number; json: unknown } | 'abort'

interface MockSwitchboard {
  revokes: Revoke[]
  credentialReads: () => number
  /** Answers the next revokes (default: success). */
  answers: RevokeAnswer[]
  /** While set, revoke answers wait for it (to observe the optimistic state). */
  hold: Promise<void> | null
  failCredentialReads: boolean
  /** While set, profile reads wait for it. */
  holdProfile: Promise<void> | null
  /** Credential reads never answer (a hung switchboard). */
  hangCredentialReads: boolean
}

const appProfile = (did: string, name: string) => ({
  appDid: did,
  documentId: `doc-${name}`,
  name,
  tagline: null,
  logo: null,
  website: null,
  publisherDid: null,
  description: null,
  category: null,
  logoRef: null,
  coverRef: null,
  links: [],
})

async function mockSwitchboard(page: Page, address: string): Promise<MockSwitchboard> {
  const issuerId = `did:pkh:eip155:1:${address.toLowerCase()}`
  const credential = (id: string, subject: string, app: string, issued: number, expires: number | null, documentId = `doc-${id}`) => ({
    documentId,
    credentialId: `urn:uuid:${id}`,
    issuerId,
    issuanceDate: iso(issued),
    expirationDate: expires === null ? null : iso(expires),
    credentialSubjectId: subject,
    credentialSubjectApp: app,
    revoked: false,
  })
  // The read model lags: a revoked credential is still listed on the next read.
  const credentials = [
    credential('alpha-new', ALPHA, 'alpha', -2, 5),
    credential('alpha-new', ALPHA, 'alpha', -2, 5, 'doc-alpha-new-copy'),
    credential('alpha-old', ALPHA, 'alpha', -20, -13),
    credential('beta', BETA, 'beta', -1, 6),
    credential('cli', CLI, 'ph-cli', -3, 27),
  ]
  const profiles: Record<string, unknown> = { [ALPHA]: appProfile(ALPHA, 'Alpha Notes'), [BETA]: appProfile(BETA, 'Beta Board') }
  let reads = 0
  const mock: MockSwitchboard = { revokes: [], credentialReads: () => reads, answers: [], hold: null, failCredentialReads: false, holdProfile: null, hangCredentialReads: false }

  await page.route(`${STUB_SWITCHBOARD_URL}/graphql**`, async (route: Route) => {
    const request = route.request()
    const { query, variables } = request.postDataJSON() as { query: string; variables: Record<string, unknown> }
    if (query.includes('renownCredentials')) {
      reads++
      if (mock.failCredentialReads) return route.fulfill({ status: 500, body: 'boom' })
      if (mock.hangCredentialReads) return
      return route.fulfill({ json: { data: { renownCredentials: credentials } } })
    }
    if (query.includes('SubjectAppProfiles')) {
      const data = Object.fromEntries(Object.entries(variables).map(([key, did]) => [`p${key.slice(1)}`, profiles[String(did)] ?? null]))
      return route.fulfill({ json: { data } })
    }
    if (query.includes('renownUsers')) {
      if (mock.holdProfile) await mock.holdProfile
      return route.fulfill({
        json: {
          data: {
            renownUsers: [
              { documentId: 'doc-me', ethAddress: address.toLowerCase(), username: null, userImage: null, displayName: 'Edie Example', handle: 'edie', bio: null, links: [], avatar: null, createdAt: null, updatedAt: null },
            ],
          },
        },
      })
    }
    if (query.includes('renown_revokeCredential')) {
      mock.revokes.push({ variables, authorization: request.headers()['authorization'] })
      if (mock.hold) await mock.hold
      const answer = mock.answers.shift() ?? { json: { data: { renown_revokeCredential: true } } }
      if (answer === 'abort') return route.abort()
      return route.fulfill({ status: answer.status ?? 200, json: answer.json })
    }
    return route.continue()
  })
  return mock
}

const forbidden = { json: { data: null, errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }] } }

async function openMe(page: Page, options: { bearer?: string } = {}) {
  const wallet = await signInTestWallet(page, options)
  const mock = await mockSwitchboard(page, wallet.address)
  await page.goto('/me')
  await expect(page.getByRole('heading', { level: 2, name: 'Connected apps' })).toBeVisible({ timeout: 30_000 })
  return { wallet, mock }
}

const apps = (page: Page) => page.getByRole('region', { name: 'Connected apps' })
const sessions = (page: Page) => page.getByRole('region', { name: 'CLI & other sessions' })
const toast = (page: Page, text: string) => page.getByRole('main').locator('[role=alert],[role=status]').filter({ hasText: text })

test.beforeEach(() => {
  test.setTimeout(120_000)
})

test('signed out: a sign-in panel, no data', async ({ page }) => {
  await page.route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), (route) => route.abort())
  await page.goto('/me')
  await expect(page.getByRole('heading', { level: 1, name: 'Your Renown' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('main').getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  await expect(page).toHaveTitle('Your Renown - Renown')
})

test('lists approvals grouped by app, with sessions apart and expiry shown', async ({ page }) => {
  const { wallet } = await openMe(page)

  // Identity card and completeness.
  await expect(page.getByRole('heading', { level: 2, name: 'Edie Example' })).toBeVisible()
  await expect(page.getByText('@edie')).toBeVisible()
  await expect(page.getByText(`did:pkh:eip155:1:${wallet.address.toLowerCase()}`)).toBeVisible()
  await expect(page.getByRole('link', { name: 'View public profile' })).toHaveAttribute('href', '/@edie')
  await expect(page.getByRole('main').getByRole('link', { name: 'Edit profile' })).toHaveAttribute('href', '/profile/edit')
  await expect(page.getByText('1 of 4 done')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Write a short bio' })).toHaveAttribute('href', '/profile/edit')

  // Apps: Alpha (two approvals, the copy counted once, one expired), Beta.
  await expect(apps(page).getByRole('heading', { level: 3 })).toHaveText(['Beta Board', 'Alpha Notes'])
  await expect(apps(page).getByRole('link', { name: 'Alpha Notes' })).toHaveAttribute('href', `/app/${ALPHA}`)
  const alpha = apps(page).getByRole('list', { name: 'Alpha Notes approvals' })
  await expect(alpha.getByRole('listitem')).toHaveCount(2)
  await expect(alpha.getByRole('listitem').nth(0)).toContainText('2 days ago')
  await expect(alpha.getByRole('listitem').nth(0)).toContainText('in 5 days')
  await expect(alpha.getByRole('listitem').nth(1)).toContainText('Expired')
  await expect(alpha.getByRole('listitem').nth(1)).toContainText('13 days ago')

  // Sessions: the CLI, by the name it gave itself and its short DID.
  await expect(sessions(page).getByRole('heading', { level: 3 })).toHaveText(['ph-cli'])
  await expect(sessions(page).getByText('did:key:z6MkMeCl…cccc')).toBeVisible()
})

test('revoke with the bearer: confirm, the row goes at once, a toast, a refetch', async ({ page }) => {
  const { wallet, mock } = await openMe(page, { bearer: 'e2e-bearer' })
  const readsBefore = mock.credentialReads()
  let release!: () => void
  mock.hold = new Promise((resolve) => (release = resolve))

  const revokeButton = apps(page).getByRole('button', { name: /^Revoke Beta Board/ })
  await revokeButton.click()
  const dialog = page.getByRole('dialog', { name: 'Revoke Beta Board?' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Beta Board will no longer be able to act for you.')
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Revoke' }).click()

  // Optimistic: gone before the switchboard answers.
  await expect(dialog).toBeHidden()
  await expect(apps(page).getByRole('heading', { name: 'Beta Board' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Connected apps' })).toBeFocused()
  release()

  await expect(toast(page, 'Revoked. Beta Board can no longer act for you.')).toBeVisible()
  expect(mock.revokes).toEqual([{ variables: { credentialId: 'urn:uuid:beta' }, authorization: 'Bearer e2e-bearer' }])
  expect(wallet.personalSignRequests).toEqual([])
  await expect.poll(() => mock.credentialReads()).toBeGreaterThan(readsBefore)
  // The lagging read model still lists it; it stays gone.
  await page.waitForTimeout(500)
  await expect(apps(page).getByRole('heading', { name: 'Beta Board' })).toHaveCount(0)
})

test('without a bearer, revoke signs the exact revoke message with the wallet', async ({ page }) => {
  const { wallet, mock } = await openMe(page)
  await sessions(page).getByRole('button', { name: /^Revoke ph-cli/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click()
  await expect(toast(page, 'Revoked. ph-cli can no longer act for you.')).toBeVisible()

  expect(mock.revokes).toHaveLength(1)
  const { variables, authorization } = mock.revokes[0]
  expect(authorization).toBeUndefined()
  const { credentialId, signature, timestamp } = variables as { credentialId: string; signature: `0x${string}`; timestamp: string }
  expect(credentialId).toBe('urn:uuid:cli')
  expect(wallet.personalSignRequests).toEqual([revokeMessage(credentialId, timestamp)])
  expect(Math.abs(Date.parse(timestamp) - Date.now())).toBeLessThan(60_000)
  expect(await verifyMessage({ address: wallet.address, message: revokeMessage(credentialId, timestamp), signature })).toBe(true)
})

test('a refused bearer falls back to the wallet signature', async ({ page }) => {
  const { wallet, mock } = await openMe(page, { bearer: 'stale-bearer' })
  mock.answers.push(forbidden)
  await apps(page).getByRole('button', { name: /^Revoke Beta Board/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click()
  await expect(toast(page, 'Revoked. Beta Board can no longer act for you.')).toBeVisible()
  expect(mock.revokes.map((r) => [r.authorization, 'signature' in r.variables])).toEqual([
    ['Bearer stale-bearer', false],
    [undefined, true],
  ])
  expect(wallet.personalSignRequests).toHaveLength(1)
})

test('a failed revoke puts the row back and explains why', async ({ page }) => {
  const { mock } = await openMe(page)
  mock.answers.push(forbidden)
  await apps(page).getByRole('button', { name: /^Revoke Beta Board/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click()
  await expect(toast(page, 'Beta Board was not revoked. Renown could not confirm the approval is yours.')).toBeVisible()
  await expect(apps(page).getByRole('heading', { name: 'Beta Board' })).toBeVisible()

  mock.answers.push('abort')
  await apps(page).getByRole('button', { name: /^Revoke Beta Board/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click()
  await expect(toast(page, 'Renown did not respond. Check your connection and try again.')).toBeVisible()
  await expect(apps(page).getByRole('heading', { name: 'Beta Board' })).toBeVisible()
})

test('a declined signature revokes nothing', async ({ page }) => {
  const { wallet, mock } = await openMe(page)
  wallet.declinePersonalSign = true
  await apps(page).getByRole('button', { name: /^Revoke Beta Board/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click()
  await expect(toast(page, 'You declined the signature, so nothing was revoked.')).toBeVisible()
  await expect(apps(page).getByRole('heading', { name: 'Beta Board' })).toBeVisible()
  expect(mock.revokes).toEqual([])
})

test('Escape cancels the dialog and returns focus to Revoke', async ({ page }) => {
  const { mock } = await openMe(page)
  const revokeButton = apps(page).getByRole('button', { name: /^Revoke Beta Board/ })
  await revokeButton.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(revokeButton).toBeFocused()
  expect(mock.revokes).toEqual([])
})

test('a failed list shows Try again, which recovers', async ({ page }) => {
  const wallet = await signInTestWallet(page)
  const mock = await mockSwitchboard(page, wallet.address)
  mock.failCredentialReads = true
  await page.goto('/me')
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Your approvals did not load', { timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Download my data' })).toBeDisabled()
  mock.failCredentialReads = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(apps(page).getByRole('heading', { level: 3 })).toHaveCount(2)
})

test('a switchboard that never answers ends in the error state, not an endless skeleton', async ({ page }) => {
  const wallet = await signInTestWallet(page)
  const mock = await mockSwitchboard(page, wallet.address)
  mock.hangCredentialReads = true
  await page.goto('/me')
  await expect(page.getByRole('heading', { level: 1, name: 'Your Renown' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Your approvals did not load', { timeout: 20_000 })
  mock.hangCredentialReads = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(apps(page).getByRole('heading', { level: 3 })).toHaveCount(2)
})

test('Download my data saves the profile and the approvals as JSON', async ({ page }) => {
  const { wallet } = await openMe(page)
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download my data' }).click()])
  expect(file.suggestedFilename()).toBe(`renown-${wallet.address.toLowerCase()}.json`)
  const data = JSON.parse(await (await file.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8'))) as {
    address: string
    profile: { handle: string }
    approvals: { name: string; kind: string; credentials: { credentialId: string; expired: boolean }[] }[]
  }
  expect(data.address).toBe(wallet.address.toLowerCase())
  expect(data.profile.handle).toBe('edie')
  expect(data.approvals.map((a) => [a.name, a.kind, a.credentials.map((c) => [c.credentialId, c.expired])])).toEqual([
    ['Beta Board', 'app', [['urn:uuid:beta', false]]],
    ['Alpha Notes', 'app', [['urn:uuid:alpha-new', false], ['urn:uuid:alpha-old', true]]],
    ['ph-cli', 'session', [['urn:uuid:cli', false]]],
  ])
})

test('Download my data waits for the profile as well as the approvals', async ({ page }) => {
  const wallet = await signInTestWallet(page)
  const mock = await mockSwitchboard(page, wallet.address)
  let release: () => void = () => {}
  mock.holdProfile = new Promise<void>((resolve) => (release = resolve))
  await page.goto('/me')
  await expect(page.getByRole('heading', { level: 2, name: 'Connected apps' })).toBeVisible({ timeout: 30_000 })
  // Approvals are in, the profile is not: a download now would say "no profile".
  await expect(page.getByRole('button', { name: 'Download my data' })).toBeDisabled()
  release()
  await expect(page.getByRole('heading', { level: 2, name: 'Edie Example' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download my data' })).toBeEnabled()
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download my data' }).click()])
  const data = JSON.parse(await (await file.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8'))) as {
    profile: { handle: string } | null
  }
  expect(data.profile?.handle).toBe('edie')
})

for (const theme of ['light', 'dark'] as const) {
  test(`has no serious axe violations, signed in and with the dialog open (${theme})`, async ({ page }, testInfo) => {
    await useTheme(page, theme)
    await openMe(page)
    await expectNoSeriousA11yViolations(page)
    await attachScreenshots(page, testInfo, `me-${theme}`)
    await page.setViewportSize({ width: 1280, height: 900 })
    await apps(page).getByRole('button', { name: /^Revoke Beta Board/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectNoSeriousA11yViolations(page)
    await testInfo.attach(`me-dialog-${theme}.png`, { body: await page.screenshot(), contentType: 'image/png' })
  })
}
