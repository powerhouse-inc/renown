import { test, expect, type Page, type Route } from '@playwright/test'
import { EXAMPLE_DATA } from '../lib/verify/examples'
import type { StoredCredentialFull } from '../lib/verify/types'
import { attachScreenshots, expectNoSeriousA11yViolations, layoutShift, useTheme, type Theme } from './support/site'
import { STUB_SWITCHBOARD_URL } from './support/stub-switchboard-client'
import { makeAppKey, makeBearerToken, makeCredential, makeV2Action, makeWallet } from './support/verify-fixtures'

// /verify in the browser, with real signatures (fresh keys per test). The
// page's public lookups go from the browser to the stub switchboard and are
// answered here with page.route, so each test owns its registry.

type Credential = Record<string, unknown>

function stored(credential: Credential, extra: Partial<StoredCredentialFull> = {}): StoredCredentialFull {
  const c = credential as {
    id: string
    '@context': string[]
    type: string[]
    issuer: { id: string; ethereumAddress: string }
    credentialSubject: { id: string; app: string }
    credentialSchema: { id: string; type: string }
    issuanceDate: string
    expirationDate: string
    proof: { proofValue: string; ethereumAddress: string; eip712: { domain: unknown } }
  }
  return {
    credentialId: c.id,
    issuerEthereumAddress: c.issuer.ethereumAddress,
    credentialSubjectId: c.credentialSubject.id,
    credentialSubjectApp: c.credentialSubject.app,
    issuanceDate: c.issuanceDate,
    expirationDate: c.expirationDate,
    revoked: false,
    revokedAt: null,
    revocationReason: null,
    context: c['@context'],
    type: c.type,
    issuerId: c.issuer.id,
    credentialSchemaId: c.credentialSchema.id,
    credentialSchemaType: c.credentialSchema.type,
    proofValue: c.proof.proofValue,
    proofEthereumAddress: c.proof.ethereumAddress,
    proofEip712Domain: JSON.stringify(c.proof.eip712.domain),
    ...extra,
  }
}

interface Registry {
  credentials: StoredCredentialFull[]
  /** Answer every lookup with HTTP 500. */
  down?: boolean
}

/** Serves the page's lookups from `registry`; returns the GraphQL bodies the browser sent. */
async function serveLookups(page: Page, registry: Registry): Promise<{ query: string; variables: Record<string, string> }[]> {
  const sent: { query: string; variables: Record<string, string> }[] = []
  const handler = async (route: Route) => {
    const body = route.request().postDataJSON() as { query: string; variables: Record<string, string> }
    sent.push(body)
    if (registry.down) return route.fulfill({ status: 500, body: 'down' })
    const v = body.variables
    if (body.query.includes('VerifyCredentialById')) {
      return route.fulfill({ json: { data: { renownCredentials: registry.credentials.filter((c) => c.credentialId === v.id) } } })
    }
    if (body.query.includes('VerifyDelegation')) {
      const rows = registry.credentials.filter(
        (c) => c.credentialSubjectId === v.did && c.issuerEthereumAddress.toLowerCase() === v.address.toLowerCase(),
      )
      return route.fulfill({ json: { data: { renownCredentials: rows } } })
    }
    if (body.query.includes('VerifyProfile')) return route.fulfill({ json: { data: { renownUsers: [] } } })
    if (body.query.includes('VerifyApp')) return route.fulfill({ json: { data: { appProfile: null } } })
    return route.continue()
  }
  await page.route(`${STUB_SWITCHBOARD_URL}/graphql`, handler)
  await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-stats`, handler)
  // The smart-wallet fallback asks the chain for the issuer's code: every
  // test wallet is a plain account (no code), as on mainnet.
  await page.route(/infura\.io|publicnode\.com/, (route) => {
    const call = route.request().postDataJSON() as { id: number; method: string }
    return route.fulfill({ json: { jsonrpc: '2.0', id: call.id, result: call.method === 'eth_getCode' ? '0x' : null } })
  })
  return sent
}

const input = (page: Page) => page.getByRole('textbox', { name: 'Paste a DID, credential, token or signed operation' })
const verdict = (page: Page) => page.locator('#verify-verdict')
const check = (page: Page, id: string) => page.locator(`[data-check="${id}"]`)

async function paste(page: Page, text: string): Promise<void> {
  await input(page).fill(text)
  await page.getByRole('button', { name: 'Check', exact: true }).click()
}

/** Opens /verify and waits until it is hydrated (the header's session button shows), so input reaches React. */
async function openVerify(page: Page): Promise<void> {
  await page.goto('/verify')
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 30_000 })
}

const EXAMPLE_REGISTRY: Registry = { credentials: [stored(EXAMPLE_DATA.credential)] }

test.describe('/verify', () => {
  test('every example checks out against a registry that holds its credential', async ({ page }) => {
    await serveLookups(page, EXAMPLE_REGISTRY)
    await openVerify(page)
    for (const [label, kind, title] of [
      ['Credential', 'credential', 'Genuine'],
      ['Bearer token', 'token', 'Genuine'],
      ['Signed operation', 'operation', 'Genuine'],
      ['DID', 'did-pkh', 'A Renown identity'],
    ]) {
      await page.getByRole('button', { name: label, exact: true }).click()
      const heading = page.locator(`section[data-kind="${kind}"] #verify-verdict`)
      await expect(heading).toHaveText(title, { timeout: 30_000 })
      await expect(heading).toBeFocused()
    }
    await expect(page.getByLabel('Document ID')).toHaveCount(0)
  })

  test('detects what is pasted as it is typed, and refuses what it cannot check', async ({ page }) => {
    await openVerify(page)
    const hint = page.locator('#verify-hint')
    await expect(hint).toHaveText('Signatures are checked here, in your browser.')
    await input(page).fill(EXAMPLE_DATA.token)
    await expect(hint).toHaveText('Looks like a bearer token.')
    await input(page).fill('{"hello": "world"}')
    await expect(hint).toContainText('This JSON is not a Renown credential or a signed operation.')
    await expect(page.getByRole('button', { name: 'Check', exact: true })).toBeDisabled()
  })

  test('a credential: genuine, forged, revoked, expired, not valid yet, and could not check', async ({ page }) => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const live = await makeCredential({ wallet, subject: key.did, app: 'Vault' })
    const lapsed = await makeCredential({
      wallet,
      subject: key.did,
      issuedAt: new Date(Date.now() - 10 * 86_400_000),
      expiresAt: new Date(Date.now() - 86_400_000),
    })
    const early = await makeCredential({ wallet, subject: key.did, issuedAt: new Date(Date.now() + 2 * 86_400_000) })
    const revokedAt = new Date(Date.now() - 3_600_000).toISOString()
    const registry: Registry = { credentials: [stored(live), stored(lapsed)] }
    await serveLookups(page, registry)
    await openVerify(page)

    await paste(page, JSON.stringify(live, null, 2))
    await expect(verdict(page)).toHaveText('Genuine', { timeout: 30_000 })
    await expect(check(page, 'signature')).toHaveAttribute('data-status', 'pass')
    await expect(page.getByRole('region', { name: 'App' })).toContainText('Vault')

    await paste(page, JSON.stringify({ ...live, credentialSubject: { id: key.did, app: 'Something else' } }))
    await expect(verdict(page)).toHaveText('Not genuine', { timeout: 30_000 })
    await expect(check(page, 'signature')).toHaveAttribute('data-status', 'fail')
    await expect(page.getByRole('region', { name: 'Claims to be signed by' })).toBeVisible()

    await paste(page, JSON.stringify(lapsed))
    await expect(verdict(page)).toHaveText('Expired', { timeout: 30_000 })

    // Validity that starts in the future is not an expiry.
    await paste(page, JSON.stringify(early))
    await expect(verdict(page)).toHaveText('Not valid yet', { timeout: 30_000 })
    await expect(check(page, 'validity')).toHaveAttribute('data-status', 'fail')
    await expect(page.locator('#verify-verdict + p')).toContainText('not valid yet')

    registry.credentials = [stored(live, { revoked: true, revokedAt })]
    await paste(page, JSON.stringify(live))
    await expect(verdict(page)).toHaveText('Revoked', { timeout: 30_000 })

    registry.down = true
    await paste(page, JSON.stringify(live))
    await expect(verdict(page)).toHaveText('Could not check', { timeout: 30_000 })
    await expect(check(page, 'revocation')).toHaveAttribute('data-status', 'unknown')
  })

  test('a bearer token speaks for a user only while their credential authorises its key', async ({ page }) => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: key.did, app: 'Vault' })
    const token = await makeBearerToken(key, wallet.address, { expiresIn: 600 })
    const registry: Registry = { credentials: [] }
    await serveLookups(page, registry)
    await openVerify(page)

    await paste(page, token)
    await expect(verdict(page)).toHaveText('Not genuine', { timeout: 30_000 })
    await expect(page.locator('#verify-verdict + p')).toContainText('never authorised this app key')

    registry.credentials = [stored(credential)]
    await paste(page, `Bearer ${token}`)
    await expect(verdict(page)).toHaveText('Genuine', { timeout: 30_000 })
    await expect(check(page, 'delegation')).toHaveAttribute('data-status', 'pass')
  })

  test('a signed operation needs its document id and holds only for that document', async ({ page }) => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: key.did, issuedAt: new Date(Date.now() - 60_000) })
    const action = await makeV2Action({ key, address: wallet.address, documentId: 'doc-42' })
    await serveLookups(page, { credentials: [stored(credential)] })
    await openVerify(page)

    await paste(page, JSON.stringify(action))
    await expect(page.locator('#verify-document-error')).toHaveText('Enter the id of the document this operation belongs to.')
    await expect(verdict(page)).toHaveCount(0)

    await page.getByLabel('Document ID').fill('doc-41')
    await page.getByRole('button', { name: 'Check', exact: true }).click()
    await expect(verdict(page)).toHaveText('Not genuine', { timeout: 30_000 })
    await expect(check(page, 'binding')).toHaveAttribute('data-status', 'fail')

    await page.getByLabel('Document ID').fill('doc-42')
    await page.getByRole('button', { name: 'Check', exact: true }).click()
    await expect(verdict(page)).toHaveText('Genuine', { timeout: 30_000 })
    await expect(page.getByLabel('Branch')).toHaveValue('main')
    // The signing time is the signer's own claim: a note, shown like any other check.
    await expect(check(page, 'timing')).toHaveAttribute('data-status', 'neutral')
    await expect(check(page, 'timing')).toContainText("the signer's own claim")
  })

  test('a share link carries the paste in the fragment, which the page takes out of the address bar', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const key = await makeAppKey()
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: key.did, issuedAt: new Date(Date.now() - 60_000) })
    const action = await makeV2Action({ key, address: wallet.address, documentId: 'doc-7', branch: 'draft' })
    const sent = await serveLookups(page, { credentials: [stored(credential)] })
    const siteRequests: string[] = []
    page.on('request', (request) => {
      if (baseURL && request.url().startsWith(baseURL)) siteRequests.push(`${request.url()} ${request.postData() ?? ''}`)
    })
    await openVerify(page)
    await input(page).fill(JSON.stringify(action))
    await page.getByLabel('Document ID').fill('doc-7')
    await page.getByLabel('Branch').fill('draft')
    await page.getByRole('button', { name: 'Check', exact: true }).click()
    await expect(verdict(page)).toHaveText('Genuine', { timeout: 30_000 })
    await page.getByRole('button', { name: 'Copy share link' }).click()
    await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    expect(link).toMatch(/\/verify#v=[A-Za-z0-9_-]+$/)

    const shared = await context.newPage()
    await serveLookups(shared, { credentials: [stored(credential)] })
    await shared.goto(link)
    await expect(verdict(shared)).toHaveText('Genuine', { timeout: 30_000 })
    expect(new URL(shared.url()).hash).toBe('')
    await expect(shared.getByLabel('Document ID')).toHaveValue('doc-7')
    await expect(shared.getByLabel('Branch')).toHaveValue('draft')

    // Only ids left the browser: the lookups carry the app key and the address, never the operation.
    const signature = (action.context as { signer: { signatures: string[][] } }).signer.signatures[0][4]
    expect(JSON.stringify(sent)).not.toContain(signature)
    expect(siteRequests.join('\n')).not.toContain(signature)
    expect(siteRequests.join('\n')).not.toContain('#v=')
  })

  test('a paste too long for a link is checked but offers no share link', async ({ page }) => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: key.did })
    await serveLookups(page, { credentials: [stored(credential)] })
    await openVerify(page)
    // Fields outside the signed ones do not change the verdict, only the length.
    await paste(page, JSON.stringify({ ...credential, note: 'x'.repeat(20_000) }))
    await expect(verdict(page)).toHaveText('Genuine', { timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Copy share link' })).toHaveCount(0)
    await expect(page.getByText('This paste is too long to share as a link.')).toBeVisible()
  })

  for (const theme of ['light', 'dark'] as Theme[]) {
    test(`no serious axe violations, no layout shift, no page scroll sideways (${theme})`, async ({ page }, testInfo) => {
      await useTheme(page, theme)
      const registry: Registry = { credentials: [stored(EXAMPLE_DATA.credential)] }
      await serveLookups(page, registry)
      await openVerify(page)
      expect(await layoutShift(page)).toBeLessThan(0.01)
      await expectNoSeriousA11yViolations(page)
      await page.getByRole('button', { name: 'Signed operation', exact: true }).click()
      await expect(verdict(page)).toHaveText('Genuine', { timeout: 30_000 })
      await expectNoSeriousA11yViolations(page)
      // The caution and danger tones, on their tinted bands.
      registry.credentials = [stored(EXAMPLE_DATA.credential, { revoked: true, revokedAt: '2026-10-11T09:01:00.000Z' })]
      await page.getByRole('button', { name: 'Bearer token', exact: true }).click()
      await expect(page.locator('section[data-kind="token"] #verify-verdict')).toHaveText('Revoked', { timeout: 30_000 })
      await expectNoSeriousA11yViolations(page)
      await paste(page, EXAMPLE_DATA.token.slice(0, -4) + 'AAAA')
      await expect(verdict(page)).toHaveText('Not genuine', { timeout: 30_000 })
      await expectNoSeriousA11yViolations(page)
      await attachScreenshots(page, testInfo, `verify-${theme}`)
    })
  }
})
