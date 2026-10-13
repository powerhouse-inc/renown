import { test, expect, type Route } from '@playwright/test'
import { dirname, join } from 'node:path'
import { createOrgArgs, createOrgProblems, EMPTY_CREATE_FORM } from '../lib/orgs/create-form'
import { INVITE_CACHE_CONTROL, inviteLinkState } from '../lib/orgs/invites'
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
})

test.describe('/invite/[token]', () => {
  test('previews the organisation and role without leaking the token', async ({ page }) => {
    const res = await page.goto(`/invite/${TOKEN}`)
    expect(res?.status()).toBe(200)
    // The dev server overrides Cache-Control on server-rendered pages, so the value is asserted on the constant the page sets.
    expect(INVITE_CACHE_CONTROL).toBe('private, no-store')
    expect(res?.headers()['cache-control']).toMatch(/no-store|no-cache/)
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

  test('joins with one signature and opens the organisation', async ({ page }) => {
    const wallet = await signInTestWallet(page, { bearer: 'e2e-join-bearer' })
    await page.goto(`/invite/${TOKEN}`)
    await page.getByRole('button', { name: 'Join Acme Join Works' }).click()
    await expect(page).toHaveURL(/\/org\/acme-join\/manage\/members$/, { timeout: 30_000 })
    expect(await signedWrite(wallet, 'acceptOrgInviteLink', null, (v) => v.token === TOKEN)).toEqual({ token: TOKEN })
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

  test('never sends the invite token to analytics', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as { __renownE2eOpenPanel?: string }).__renownE2eOpenPanel = 'e2e-openpanel'
    })
    await page.route(/openpanel\.dev\/op1\.js/, (route) => route.fulfill({ path: OPENPANEL_TRACKER, contentType: 'application/javascript' }))
    const events: string[] = []
    await page.route(/api\.openpanel\.dev/, (route: Route) => {
      events.push(route.request().postData() ?? '')
      return route.fulfill({ json: {} })
    })
    await page.goto(`/invite/${TOKEN}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Join Acme Join Works' })).toBeVisible()
    // Hydrated (the Join control has loaded), so the footer link is a client-side navigation.
    await expect(page.getByRole('button', { name: 'Sign in to join' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('contentinfo').getByRole('link', { name: 'Organisations' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Organisations on Renown' })).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => events.some((e) => e.includes('/orgs')), { timeout: 15_000 }).toBe(true)
    await page.waitForTimeout(500)
    expect(events.join('\n')).not.toContain(TOKEN)
    expect(events.join('\n')).not.toContain('/invite/')
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
})
