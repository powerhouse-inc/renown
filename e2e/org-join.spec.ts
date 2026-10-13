import { test, expect, type Page, type Route } from '@playwright/test'
import { dirname, join } from 'node:path'
import { createOrgArgs, createOrgProblems, EMPTY_CREATE_FORM } from '../lib/orgs/create-form'
import { loadInvitePage } from '../lib/orgs/invite-page-data'
import { inviteLinkState } from '../lib/orgs/invites'
import { SCRUB_SHARE_FRAGMENTS } from '../components/analytics/scrub-share-fragments'
import { takeArrival, withArrival } from '../services/analytics/arrival'
import { membership, organization, orgMember, orgSummary, serveOrgReads } from './support/org-fixtures'
import { signedWrite } from './support/org-manage'
import { fixtureStub, STUB_SWITCHBOARD_URL, stubRequests } from './support/stub-switchboard-client'
import { signInTestWallet } from './support/test-session'

const ORG = orgSummary({ id: 'a0c0ffee-0000-4000-8000-00000000b001', handle: 'acme-join', name: 'Acme Join Works', verifiedDomains: ['acme-join.example'] })
const TOKEN = 'joinTokenUsableAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const preview = (over: Record<string, unknown>) => ({
  data: { orgInviteLink: { org: ORG, role: 'PUBLISHER', expiresAt: '2026-10-19T10:00:00.000Z', expired: false, revoked: false, full: false, usable: true, ...over } },
})
const OPENPANEL_TRACKER = join(
  dirname(require.resolve('@openpanel/web', { paths: [dirname(require.resolve('@openpanel/nextjs'))] })),
  'src/tracker.global.js',
)

/** Turns OpenPanel on for the page (e2e builds only), serves the real tracker and collects what it sends. */
async function recordAnalytics(page: Page): Promise<string[]> {
  await page.addInitScript(() => {
    ;(window as { __renownE2eOpenPanel?: string }).__renownE2eOpenPanel = 'e2e-openpanel'
  })
  await page.route(/openpanel\.dev\/op1\.js/, (route) => route.fulfill({ path: OPENPANEL_TRACKER, contentType: 'application/javascript' }))
  const events: string[] = []
  await page.route(/api\.openpanel\.dev/, (route: Route) => {
    events.push(route.request().postData() ?? '')
    return route.fulfill({ json: {} })
  })
  return events
}

test.beforeAll(async () => {
  await fixtureStub({ match: 'query OrgInviteLinkPreview', variables: TOKEN, response: preview({}) })
  await fixtureStub({ match: 'query OrgInviteLinkPreview', variables: 'joinTokenExpiredAAAAAAAAAAAAAAAAAAAAAAAAAAAA', response: preview({ expired: true, usable: false }) })
  await fixtureStub({ match: 'query OrgInviteLinkPreview', variables: 'joinTokenRevokedAAAAAAAAAAAAAAAAAAAAAAAAAAAA', response: preview({ revoked: true, usable: false }) })
  await fixtureStub({ match: 'query OrgInviteLinkPreview', variables: 'joinTokenFullAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', response: preview({ full: true, usable: false }) })
  await fixtureStub({
    match: 'mutation AcceptOrgInviteLink',
    variables: TOKEN,
    response: { data: { acceptOrgInviteLink: orgMember({ orgId: ORG.id, address: '0x0e000000000000000000000000000000000000e5', role: 'PUBLISHER' }) } },
  })
})

test.describe('create form rules', () => {
  test('asks for a name and a valid handle, omits blank optional fields', () => {
    expect(createOrgProblems(EMPTY_CREATE_FORM)).toEqual({ name: 'Give the organisation a name.', handle: 'Choose a handle.' })
    expect(createOrgProblems({ ...EMPTY_CREATE_FORM, name: 'Acme', handle: 'acme', website: 'acme.example' })).toEqual({
      website: 'Use a full address starting with https://.',
    })
    expect(createOrgArgs({ ...EMPTY_CREATE_FORM, name: ' Acme ', handle: ' @Acme ', bio: '  ', website: '' })).toEqual({
      handle: 'acme',
      name: 'Acme',
      listed: false,
      membersPublic: false,
    })
    expect(inviteLinkState({ usable: false, expired: true, revoked: true, full: true })).toBe('revoked')
    expect(inviteLinkState({ usable: true, expired: false, revoked: false, full: false })).toBe('usable')
  })

  test("the invite page's server answer is never stored (the dev server rewrites Cache-Control, so the page's loader is called directly)", async () => {
    const headers: Record<string, string> = {}
    const res = { statusCode: 200, setHeader: (name: string, value: string) => void (headers[name.toLowerCase()] = value) }
    await loadInvitePage('short', res)
    const NEVER_STORED = /^private, no-store$/
    expect('no-cache, must-revalidate').not.toMatch(NEVER_STORED)
    expect(headers['cache-control']).toMatch(NEVER_STORED)
    expect(headers['referrer-policy']).toBe('no-referrer')
    expect(res.statusCode).toBe(404)
  })

  test("OpenPanel's filter replaces an invite token in every property; arrival flags are one-shot", () => {
    const filter = new Function(`return (${SCRUB_SHARE_FRAGMENTS})`)() as (event: unknown) => boolean
    const event = {
      type: 'track',
      payload: { name: 'screen_view', properties: { __path: `https://renown.id/invite/${TOKEN}?x=1`, __referrer: `http://localhost:3000/invite/${TOKEN}`, other: 'https://renown.id/orgs' } },
    }
    expect(filter(event)).toBe(true)
    expect(event.payload.properties).toEqual({
      __path: 'https://renown.id/invite/redacted?x=1',
      __referrer: 'http://localhost:3000/invite/redacted',
      other: 'https://renown.id/orgs',
    })
    expect(withArrival('/org/acme/manage/members', 'joined', 'invite')).toBe('/org/acme/manage/members?joined=invite')
    expect(takeArrival('/org/acme/manage/members?joined=invite#x')).toEqual({ event: 'org.invite.accepted', rest: '/org/acme/manage/members#x' })
    expect(takeArrival('/org/acme/manage/members?tab=1&joined=nope')).toEqual({ event: null, rest: '/org/acme/manage/members?tab=1' })
    expect(takeArrival('/org/acme/manage/members')).toBeNull()
  })
})

test.describe('/invite/[token]', () => {
  test('previews the organisation and role without leaking the token', async ({ page }) => {
    const res = await page.goto(`/invite/${TOKEN}`)
    expect(res?.status()).toBe(200)
    expect(res?.headers()['referrer-policy']).toBe('no-referrer')
    await expect(page.getByRole('heading', { level: 1, name: 'Join Acme Join Works' })).toBeVisible()
    await expect(page.getByText('Verified: acme-join.example')).toBeVisible()
    await expect(page.getByText('You are invited to join as Publisher.')).toBeVisible()
    await expect(page.getByText('This link expires on 19 October 2026.')).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
    await expect(page.getByRole('button', { name: 'Sign in to join' })).toBeVisible({ timeout: 30_000 })
  })

  test('explains expired, revoked and used-up links, and 404s unknown ones', async ({ page }) => {
    for (const [token, text] of [
      ['joinTokenExpiredAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'This invite link has expired.'],
      ['joinTokenRevokedAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'This invite link was revoked.'],
      ['joinTokenFullAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'This invite link has been used as many times as it allows.'],
    ]) {
      await page.goto(`/invite/${token}`)
      await expect(page.getByRole('status')).toContainText(text)
      await expect(page.getByRole('button', { name: /Join/ })).toHaveCount(0)
    }
    expect((await page.goto('/invite/joinTokenUnknownAAAAAAAAAAAAAAAAAAAAAAAAAAAA'))?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'Invite not found' })).toBeVisible()
    expect((await page.goto('/invite/short'))?.status()).toBe(404)
  })

  test('joins with one signature, opens the organisation and records the join there', async ({ page }) => {
    const wallet = await signInTestWallet(page, { bearer: 'e2e-join-bearer' })
    const events = await recordAnalytics(page)
    await page.goto(`/invite/${TOKEN}`)
    await page.getByRole('button', { name: 'Join Acme Join Works' }).click()
    // The one-shot ?joined=invite flag is recorded and taken out of the address bar.
    await expect(page).toHaveURL(/\/org\/acme-join\/manage\/members$/, { timeout: 30_000 })
    expect(await signedWrite(wallet, 'acceptOrgInviteLink', null, (v) => v.token === TOKEN)).toEqual({ token: TOKEN })
    await expect.poll(() => events.filter((e) => e.includes('org.invite.accepted')).length, { timeout: 15_000 }).toBe(1)
    await page.reload()
    await page.waitForTimeout(1000)
    expect(events.filter((e) => e.includes('org.invite.accepted'))).toHaveLength(1)
    expect(events.join('\n')).not.toContain(TOKEN)
  })

  test('a lost answer re-reads the membership instead of signing again (D21)', async ({ page }) => {
    const wallet = await signInTestWallet(page, { bearer: 'e2e-join-bearer' })
    await page.route('**/api/org/acceptOrgInviteLink', (route) => route.abort())
    await serveOrgReads(page, {
      OrgByRef: () => ({ organization: organization({ ...ORG, viewerMembership: membership(ORG.id, wallet.address, 'PUBLISHER') }) }),
    })
    await page.goto(`/invite/${TOKEN}`)
    await page.getByRole('button', { name: 'Join Acme Join Works' }).click()
    await expect(page).toHaveURL(/\/org\/acme-join\/manage\/members$/, { timeout: 30_000 })
    expect(wallet.personalSignRequests.filter((m) => m.includes(' acceptOrgInviteLink '))).toHaveLength(1)
  })

  test('when the re-read fails too, Check again reads instead of signing', async ({ page }) => {
    const wallet = await signInTestWallet(page, { bearer: 'e2e-join-bearer' })
    await page.route('**/api/org/acceptOrgInviteLink', (route) => route.abort())
    let orgReads = 0
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
      const body = route.request().postDataJSON() as { query: string }
      if (!body.query.includes('query OrgByRef')) return route.fallback()
      orgReads += 1
      if (orgReads === 1) return route.abort()
      return route.fulfill({ json: { data: { organization: organization({ ...ORG, viewerMembership: membership(ORG.id, wallet.address, 'PUBLISHER') }) } } })
    })
    await page.goto(`/invite/${TOKEN}`)
    await page.getByRole('button', { name: 'Join Acme Join Works' }).click()
    await expect(page.getByRole('main').getByRole('alert')).toContainText('it is not known whether you joined')
    await page.getByRole('button', { name: 'Check again' }).click()
    await expect(page).toHaveURL(/\/org\/acme-join\/manage\/members$/, { timeout: 30_000 })
    expect(orgReads).toBe(2)
    expect(wallet.personalSignRequests.filter((m) => m.includes(' acceptOrgInviteLink '))).toHaveLength(1)
  })

  test('never sends the invite token to analytics', async ({ page }) => {
    const events = await recordAnalytics(page)
    await page.goto(`/invite/${TOKEN}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Join Acme Join Works' })).toBeVisible()
    // Hydrated (the Join control has loaded), so the footer link is a client-side navigation.
    await expect(page.getByRole('button', { name: 'Sign in to join' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('contentinfo').getByRole('link', { name: 'Organisations' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Organisations on Renown' })).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => events.some((e) => e.includes('/orgs')), { timeout: 15_000 }).toBe(true)
    // OpenPanel, once loaded, keeps listening to history for the life of the document: Back and Forward pass the invite page again.
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: 'Join Acme Join Works' })).toBeVisible({ timeout: 30_000 })
    await page.goForward()
    await expect(page.getByRole('heading', { level: 1, name: 'Organisations on Renown' })).toBeVisible({ timeout: 30_000 })
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: 'Join Acme Join Works' })).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(1000)
    // Back reached the invite page with OpenPanel loaded: its screen view went out, with the token replaced.
    expect(events.some((e) => e.includes('/invite/redacted'))).toBe(true)
    expect(events.join('\n')).not.toContain(TOKEN)
    expect(events.join('\n').replaceAll('/invite/redacted', '')).not.toContain('/invite/')
  })
})

test.describe('/org/new', () => {
  test('asks visitors to sign in', async ({ page }) => {
    await page.goto('/org/new')
    await expect(page.getByRole('heading', { level: 1, name: 'Create an organisation' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  })

  test('creates an organisation with a suggested handle and opens it', async ({ page }) => {
    const handle = `acme-${Date.now().toString(36)}`
    await fixtureStub({
      match: 'mutation CreateOrganization',
      variables: handle,
      response: { data: { createOrganization: organization({ id: crypto.randomUUID(), handle, name: 'Acme Create' }) } },
    })
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
      const body = route.request().postDataJSON() as { query: string; variables: { handle?: string } }
      if (!body.query.includes('query OrgHandleAvailability')) return route.continue()
      const taken = body.variables.handle === 'acme-taken'
      return route.fulfill({ json: { data: { orgHandleAvailability: { handle: body.variables.handle, available: !taken, reason: taken ? 'TAKEN' : null } } } })
    })
    const wallet = await signInTestWallet(page, { bearer: 'e2e-create-bearer' })
    await page.goto('/org/new')
    await page.getByLabel('Name', { exact: true }).fill('Acme Create')
    await expect(page.getByLabel('Handle')).toHaveValue('acme-create')
    await page.getByLabel('Handle').fill('acme-taken')
    await expect(page.getByText('This handle is taken.')).toBeVisible()
    await page.getByRole('button', { name: 'Create organisation' }).click()
    expect(await stubRequests('mutation CreateOrganization(').then((r) => r.filter((x) => x.variables.handle === 'acme-taken'))).toEqual([])
    await page.getByLabel('Handle').fill(handle)
    await expect(page.getByText(`renown.id/@${handle} is available.`)).toBeVisible()
    await page.getByRole('switch', { name: 'List in the organisation directory' }).click()
    await page.getByRole('button', { name: 'Create organisation' }).click()
    await expect(page).toHaveURL(new RegExp(`/org/${handle}/manage/members$`), { timeout: 30_000 })
    expect(await signedWrite(wallet, 'createOrganization', null, (v) => v.handle === handle)).toEqual({
      handle,
      name: 'Acme Create',
      listed: true,
      membersPublic: false,
    })
  })

  test('a lost answer is checked before anything is signed again (D21)', async ({ page }) => {
    const handle = `acme-lost-${Date.now().toString(36)}`
    await page.route('**/api/org/createOrganization', (route) => route.abort())
    let orgReads = 0
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
      const body = route.request().postDataJSON() as { query: string; variables: { handle?: string } }
      if (body.query.includes('query OrgHandleAvailability')) {
        return route.fulfill({ json: { data: { orgHandleAvailability: { handle: body.variables.handle, available: true, reason: null } } } })
      }
      if (!body.query.includes('query OrgByRef')) return route.continue()
      orgReads += 1
      // The first check finds Renown still silent; the second finds the organisation, owned by the viewer.
      if (orgReads === 1) return route.abort()
      const orgId = crypto.randomUUID()
      const org = organization({ id: orgId, handle, name: 'Acme Lost', viewerMembership: membership(orgId, wallet.address, 'OWNER') })
      return route.fulfill({ json: { data: { organization: org } } })
    })
    const wallet = await signInTestWallet(page, { bearer: 'e2e-create-bearer' })
    await page.goto('/org/new')
    await page.getByLabel('Name', { exact: true }).fill('Acme Lost')
    await page.getByLabel('Handle').fill(handle)
    await expect(page.getByText(`renown.id/@${handle} is available.`)).toBeVisible()
    await page.getByRole('button', { name: 'Create organisation' }).click()
    await expect(page.getByRole('main').getByRole('alert')).toContainText('not known whether the organisation was created')
    await page.getByRole('button', { name: 'Check again' }).click()
    await expect(page).toHaveURL(new RegExp(`/org/${handle}/manage/members$`), { timeout: 30_000 })
    expect(wallet.personalSignRequests.filter((m) => m.includes(' createOrganization '))).toHaveLength(1)
  })

  test('HANDLE_TAKEN after a lost answer re-reads and opens the viewer\'s own organisation (D21)', async ({ page }) => {
    const handle = `acme-late-${Date.now().toString(36)}`
    let writes = 0
    await page.route('**/api/org/createOrganization', (route) => {
      writes += 1
      // First: the answer is lost. Second: the first create has landed meanwhile.
      if (writes === 1) return route.abort()
      return route.fulfill({ status: 409, json: { error: 'Handle taken', code: 'HANDLE_TAKEN', field: 'handle' } })
    })
    let orgReads = 0
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
      const body = route.request().postDataJSON() as { query: string; variables: { handle?: string } }
      if (body.query.includes('query OrgHandleAvailability')) {
        return route.fulfill({ json: { data: { orgHandleAvailability: { handle: body.variables.handle, available: true, reason: null } } } })
      }
      if (!body.query.includes('query OrgByRef')) return route.continue()
      orgReads += 1
      // Not found twice (right after the lost answer, then on Check again); found, owned by the viewer, after HANDLE_TAKEN.
      if (orgReads < 3) return route.fulfill({ json: { data: { organization: null } } })
      const orgId = crypto.randomUUID()
      return route.fulfill({
        json: { data: { organization: organization({ id: orgId, handle, name: 'Acme Late', viewerMembership: membership(orgId, wallet.address, 'OWNER') }) } },
      })
    })
    const wallet = await signInTestWallet(page, { bearer: 'e2e-create-bearer' })
    await page.goto('/org/new')
    await page.getByLabel('Name', { exact: true }).fill('Acme Late')
    await page.getByLabel('Handle').fill(handle)
    await expect(page.getByText(`renown.id/@${handle} is available.`)).toBeVisible()
    await page.getByRole('button', { name: 'Create organisation' }).click()
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('We couldn’t confirm the organisation was created — check again.')
    // The handle stays as it was until Renown has answered.
    await expect(page.getByLabel('Handle')).toHaveAttribute('readonly', '')
    await page.getByRole('button', { name: 'Check again' }).click()
    await expect(page).toHaveURL(new RegExp(`/org/${handle}/manage/members$`), { timeout: 30_000 })
    expect(writes).toBe(2)
    expect(orgReads).toBe(3)
  })

  test('a handle Renown refuses shows why', async ({ page }) => {
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
      const body = route.request().postDataJSON() as { query: string; variables: { handle?: string } }
      if (!body.query.includes('query OrgHandleAvailability')) return route.continue()
      return route.fulfill({ json: { data: { orgHandleAvailability: { handle: body.variables.handle, available: false, reason: 'INVALID' } } } })
    })
    await signInTestWallet(page, { bearer: 'e2e-create-bearer' })
    await page.goto('/org/new')
    await page.getByLabel('Handle').fill('acme-refused')
    await expect(page.getByText('Renown does not accept this handle. Try another.')).toBeVisible({ timeout: 30_000 })
  })
})
