import { test, expect, type Page, type Route } from '@playwright/test'
import { dirname, join } from 'node:path'
import { SCRUB_SHARE_FRAGMENTS } from '../components/analytics/scrub-share-fragments'
import { EXAMPLE_DATA } from '../lib/verify/examples'
import { shareFragment, type SharedInput } from '../lib/verify/share'
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

function share(input: SharedInput): string {
  const fragment = shareFragment(input)
  if (!fragment) throw new Error('not shareable')
  return fragment
}

/** Next's router (pages), as the browser exposes it. */
type WindowWithNext = Window & { next: { router: { push(url: string): Promise<boolean> } } }

/** The real OpenPanel tracker (@openpanel/web 1.4.1), served in place of the CDN's op1.js. */
const OPENPANEL_TRACKER = join(
  dirname(require.resolve('@openpanel/web', { paths: [dirname(require.resolve('@openpanel/nextjs'))] })),
  'src/tracker.global.js',
)

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
    const undated = await makeCredential({ wallet, subject: key.did, rawIssuanceDate: 'not a date' })
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

    // Dates that cannot be read: not valid, and no claim about when.
    await paste(page, JSON.stringify(undated))
    await expect(verdict(page)).toHaveText('Not valid', { timeout: 30_000 })
    await expect(page.locator('#verify-verdict + p')).toContainText('its dates cannot be read')

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
    const allRequests: string[] = []
    page.on('request', (request) => {
      const seen = `${request.url()} ${request.headers().referer ?? ''} ${request.postData() ?? ''}`
      allRequests.push(seen)
      if (baseURL && request.url().startsWith(baseURL)) siteRequests.push(seen)
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
    // Neither the opened link's fragment nor its payload went out with any request (URL, referrer or body).
    const payload = link.split('#v=')[1]
    expect(payload.length).toBeGreaterThan(20)
    expect(allRequests.join('\n')).not.toContain(payload)
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

  test('a second share link opened in the same tab is checked and leaves the address bar', async ({ page }) => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: key.did })
    await serveLookups(page, { credentials: [stored(credential)] })
    const did = `did:pkh:eip155:1:${wallet.address.toLowerCase()}`
    await page.goto(`/verify${share({ text: did, documentId: '', branch: 'main' })}`)
    await expect(page.locator('section[data-kind="did-pkh"] #verify-verdict')).toHaveText('A Renown identity', { timeout: 30_000 })
    await expect.poll(() => new URL(page.url()).hash).toBe('')

    // Pasted into the address bar of the same tab: a same-document fragment navigation.
    const text = JSON.stringify(credential)
    await page.evaluate((hash) => {
      window.location.hash = hash
    }, share({ text, documentId: '', branch: 'main' }))
    await expect(page.locator('section[data-kind="credential"] #verify-verdict')).toHaveText('Genuine', { timeout: 30_000 })
    await expect(input(page)).toHaveValue(text)
    await expect.poll(() => new URL(page.url()).hash).toBe('')

    // A client-side link to another share link.
    await page.evaluate((url) => (window as unknown as WindowWithNext).next.router.push(url), `/verify${share({ text: did, documentId: '', branch: 'main' })}`)
    await expect(page.locator('section[data-kind="did-pkh"] #verify-verdict')).toHaveText('A Renown identity', { timeout: 30_000 })
    await expect(input(page)).toHaveValue(did)
    await expect.poll(() => new URL(page.url()).hash).toBe('')
  })

  test('analytics never records a share fragment', async ({ page }) => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: key.did })
    await serveLookups(page, { credentials: [stored(credential)] })
    // Turns OpenPanel on for this page (components/analytics, e2e builds only) and serves the real tracker.
    await page.addInitScript(() => {
      ;(window as { __renownE2eOpenPanel?: string }).__renownE2eOpenPanel = 'e2e-openpanel'
    })
    await page.route(/openpanel\.dev\/op1\.js/, (route) => route.fulfill({ path: OPENPANEL_TRACKER, contentType: 'application/javascript' }))
    const events: { type: string; payload: { name?: string; properties?: Record<string, unknown> } }[] = []
    await page.route(/api\.openpanel\.dev/, (route) => {
      const body = route.request().postData()
      if (body) events.push(JSON.parse(body) as (typeof events)[number])
      return route.fulfill({ json: {} })
    })
    const screenViews = () => events.filter((e) => e.payload.name === 'screen_view').map((e) => String(e.payload.properties?.__path))

    const did = `did:pkh:eip155:1:${wallet.address.toLowerCase()}`
    await page.goto(`/verify${share({ text: did, documentId: '', branch: 'main' })}`)
    await expect(verdict(page)).toHaveText('A Renown identity', { timeout: 30_000 })
    await expect.poll(screenViews, { timeout: 15_000 }).toContainEqual(expect.stringMatching(/\/verify$/))

    await page.evaluate((hash) => {
      window.location.hash = hash
    }, share({ text: JSON.stringify(credential), documentId: '', branch: 'main' }))
    await expect(page.locator('section[data-kind="credential"] #verify-verdict')).toHaveText('Genuine', { timeout: 30_000 })
    await page.evaluate((url) => (window as unknown as WindowWithNext).next.router.push(url), `/verify${share({ text: did, documentId: '', branch: 'main' })}`)
    await expect(page.locator('section[data-kind="did-pkh"] #verify-verdict')).toHaveText('A Renown identity', { timeout: 30_000 })
    // OpenPanel debounces screen views by 50 ms; give any late one time to arrive.
    await page.waitForTimeout(500)

    expect(screenViews().length).toBeGreaterThan(0)
    for (const path of screenViews()) expect(path).not.toContain('#')
    expect(JSON.stringify(events)).not.toContain('#v=')
  })

  test("OpenPanel's filter cuts a share fragment out of every property and keeps other URLs", () => {
    const filter = new Function(`return (${SCRUB_SHARE_FRAGMENTS})`)() as (event: unknown) => boolean
    const event = {
      type: 'track',
      payload: { name: 'screen_view', properties: { __path: 'https://renown.id/verify#v=eyJ0IjoiZGlkOnBraCJ9', __title: 'Verify', other: 'https://renown.id/developers#sdk', n: 1 } },
    }
    expect(filter(event)).toBe(true)
    expect(event.payload.properties).toEqual({ __path: 'https://renown.id/verify', __title: 'Verify', other: 'https://renown.id/developers#sdk', n: 1 })
    expect(filter({ type: 'identify', payload: { profileId: 'x' } })).toBe(true)
  })

  test('the live region announces the verdict, not the whole report; a refused copy says so', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } })
    })
    await serveLookups(page, EXAMPLE_REGISTRY)
    await openVerify(page)
    await page.getByRole('button', { name: 'DID', exact: true }).click()
    await expect(verdict(page)).toHaveText('A Renown identity', { timeout: 30_000 })
    await expect(page.locator('[aria-live] [data-check]')).toHaveCount(0)
    await expect(page.locator('[aria-live] #verify-verdict')).toHaveCount(0)

    await page.getByRole('button', { name: 'Copy share link' }).click()
    await expect(page.getByText('Could not copy the link. Select it below and copy it yourself.')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Share link' })).toHaveValue(/\/verify#v=[A-Za-z0-9_-]+$/)
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
