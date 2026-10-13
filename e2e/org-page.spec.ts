import { test, expect } from '@playwright/test'
import { fixtureStub, graphqlError, stubRequests } from './support/stub-switchboard-client'
import { APP_DID_A, organization, orgMember, orgSummary } from './support/org-fixtures'
import { orgPageCacheControl } from '../lib/orgs/org-page-data'

// Server-rendered organisation pages: reads answered by stub fixtures with
// variables no other spec uses (handles acme-page*, the ids below).
const ORG_ID = 'a0c0ffee-0000-4000-8000-00000000a001'
const ARCHIVED_ID = 'a0c0ffee-0000-4000-8000-00000000a004'
const BUSY_ID = 'a0c0ffee-0000-4000-8000-00000000a005'
const ORG = organization({
  id: ORG_ID,
  did: `did:web:www.renown.id:org:${ORG_ID}`,
  handle: 'acme-page',
  name: 'Acme Page Works',
  bio: 'We build pages that hold.',
  website: 'https://acme-page.example',
  links: [
    { id: 'l1', label: 'GitHub', url: 'https://github.com/acme-page' },
    { id: 'l2', label: 'Sneaky', url: 'javascript:alert(1)' },
  ],
  verifiedDomains: ['acme-page.example'],
  apps: [{ appDid: APP_DID_A, addedAt: '2026-10-02T10:00:00.000Z', frozen: false }],
  memberCount: 4,
})
const APP = {
  appDid: APP_DID_A,
  documentId: 'doc-org-page-app',
  name: 'Acme Page Ledger',
  tagline: 'Ledgers for pages',
  logo: null,
  website: null,
  publisherDid: ORG.did,
  description: null,
  category: null,
  logoRef: null,
  coverRef: null,
  links: [],
}
const DID_DOC = {
  '@context': ['https://www.w3.org/ns/did/v1'],
  id: ORG.did,
  alsoKnownAs: ['https://www.renown.id/@acme-page'],
  controller: ['did:pkh:eip155:1:0x0a00000000000000000000000000000000000a11'],
}
const PERSON = {
  documentId: 'doc-org-member',
  username: null,
  ethAddress: '0x0a00000000000000000000000000000000000b22',
  userImage: null,
  displayName: 'Lena Member',
  handle: 'lena-member',
  bio: 'Member of things.',
  links: [],
  avatar: null,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-10-09T10:00:00.000Z',
}

test.beforeAll(async () => {
  const org = (value: unknown) => ({ data: { organization: value } })
  await fixtureStub({ match: 'query OrgByRef', variables: '"acme-page"', response: org(ORG) })
  await fixtureStub({ match: 'query OrgByRef', variables: `"id":"${ORG_ID}"`, response: org(ORG) })
  await fixtureStub({
    match: 'query OrgByRef',
    variables: '"acme-page-copy"',
    response: org(
      organization({
        id: 'a0c0ffee-0000-4000-8000-00000000a002',
        handle: 'acme-page-copy',
        name: 'Acme Page Works',
        membersPublic: false,
        notAffiliatedWith: orgSummary({ id: ORG_ID, handle: 'acme-page', name: 'Acme Page Works', verifiedDomains: ['acme-page.example'] }),
      }),
    ),
  })
  await fixtureStub({
    match: 'query OrgByRef',
    variables: '"acme-page-gone"',
    response: org(organization({ id: 'a0c0ffee-0000-4000-8000-00000000a003', handle: 'acme-page-gone', name: 'Gone Works', takenDown: true })),
  })
  await fixtureStub({ match: 'query OrgByRef', variables: '"acme-page-down"', response: graphqlError('down', 'SERVICE_UNAVAILABLE') })
  await fixtureStub({
    match: 'query OrgByRef',
    variables: '"acme-page-old"',
    response: org(organization({ id: ARCHIVED_ID, handle: 'acme-page-old', name: 'Old Page Works', archived: true })),
  })
  await fixtureStub({ match: 'query OrgByRef', variables: '"acme-page-busy"', response: graphqlError('Too many requests', 'RATE_LIMITED') })
  // The switchboard serves no DID document for an archived or taken-down organisation (D18).
  await fixtureStub({ match: 'query OrgDidDocument', variables: ARCHIVED_ID, response: { data: { organizationDidDocument: null } } })
  await fixtureStub({ match: 'query OrgDidDocument', variables: BUSY_ID, response: graphqlError('Too many requests', 'RATE_LIMITED') })
  await fixtureStub({
    match: 'query OrganizationStats',
    variables: ORG_ID,
    response: { data: { organizationStats: { orgId: ORG_ID, apps: 1, activeUsers30d: 321, activeDelegations: 5, attestations30d: 2 } } },
  })
  await fixtureStub({ match: 'query AppProfilesByOrg', variables: ORG_ID, response: { data: { appProfiles: { items: [APP], next: null } } } })
  await fixtureStub({
    match: 'query OrgMembers',
    variables: ORG_ID,
    response: {
      data: {
        organizationMembers: [
          orgMember({ orgId: ORG_ID, address: '0x0a00000000000000000000000000000000000a11', displayName: 'Alice Pagewright', handle: 'alice-page', role: 'OWNER' }),
        ],
      },
    },
  })
  await fixtureStub({ match: 'query OrgDidDocument', variables: ORG_ID, response: { data: { organizationDidDocument: JSON.stringify(DID_DOC) } } })
  await fixtureStub({ match: 'renownUsers', variables: '"lena-member"', response: { data: { renownUsers: [PERSON] } } })
  await fixtureStub({
    match: 'query OrgsByMember',
    variables: PERSON.ethAddress,
    response: {
      data: {
        organizationsByMember: [
          { role: 'PUBLISHER', hidden: false, org: { ...orgSummary({ id: ORG_ID, handle: 'acme-page', name: 'Acme Page Works' }), archived: false } },
        ],
      },
    },
  })
})

test.describe('organisation page', () => {
  test('renders an organisation at /@handle with apps, totals, members and JSON-LD', async ({ page }) => {
    const res = await page.goto('/@acme-page')
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Acme Page Works' })).toBeVisible()
    await expect(page.getByText('@acme-page', { exact: true })).toBeVisible()
    await expect(page.getByText('Verified: acme-page.example')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Acme Page Ledger' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Members' }).getByText('Alice Pagewright')).toBeVisible()
    // memberCount (4) counts hidden members; only the public list is counted.
    await expect(page.getByText('1 member', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Links' }).getByRole('link', { name: /GitHub/ })).toHaveAttribute('href', 'https://github.com/acme-page')
    await expect(page.getByText('Sneaky')).toHaveCount(0)
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
    await expect(page.getByText('Up to 321')).toBeVisible()
    await expect(page.getByRole('link', { name: 'See in the app directory' })).toHaveAttribute('href', '/apps?org=acme-page')
    await expect(page.getByRole('link', { name: 'DID document' })).toHaveAttribute('href', `/org/${ORG_ID}/did.json`)
    await expect(page).toHaveTitle('Acme Page Works (@acme-page) on Renown')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/@acme-page$/)
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}')
    expect(ld).toMatchObject({ '@type': 'Organization', name: 'Acme Page Works', identifier: ORG.did, alternateName: '@acme-page' })
    expect(ld.sameAs).toEqual(['https://github.com/acme-page', 'https://acme-page.example'])
  })

  test('says when an organisation is unverified and shares a verified one’s name', async ({ page }) => {
    await page.goto('/@acme-page-copy')
    await expect(page.getByText('Unverified organisation')).toBeVisible()
    const note = page.getByRole('note')
    await expect(note).toContainText('Not affiliated with the verified Acme Page Works')
    await expect(note.getByRole('link', { name: 'Acme Page Works' })).toHaveAttribute('href', '/@acme-page')
    await expect(page.getByRole('list', { name: 'Members' })).toHaveCount(0)
  })

  test('an archived organisation is labelled and not indexed', async ({ page }) => {
    const res = await page.goto('/@acme-page-old')
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Old Page Works' })).toBeVisible()
    await expect(page.getByText('Archived', { exact: true })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })

  test('a degraded organisation page is never cached', () => {
    expect(orgPageCacheControl(true)).toBe('no-store')
    expect(orgPageCacheControl(false)).toBe('public, s-maxage=30, stale-while-revalidate=120')
  })

  test('a taken-down organisation shows only the notice', async ({ page }) => {
    const res = await page.goto('/@acme-page-gone')
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Gone Works' })).toBeVisible()
    await expect(page.getByText("This organisation was taken down by Renown's moderators.")).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.getByText('Unverified organisation')).toHaveCount(0)
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0)
  })

  test('answers 503 when organisations cannot be read, and 404 for an unknown handle', async ({ page }) => {
    const down = await page.goto('/@acme-page-down')
    expect(down?.status()).toBe(503)
    expect(down?.headers()['retry-after']).toBe('30')
    await expect(page.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeVisible()
    const busy = await page.goto('/@acme-page-busy')
    expect(busy?.status()).toBe(503)
    expect(busy?.headers()['retry-after']).toBe('30')
    const missing = await page.goto('/@acme-page-nobody')
    expect(missing?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'Profile not found' })).toBeVisible()
  })

  test('/org/<id or handle> redirects to the handle', async ({ request }) => {
    for (const ref of [ORG_ID, 'acme-page']) {
      const res = await request.get(`/org/${ref}`, { maxRedirects: 0 })
      expect(res.status()).toBe(307)
      expect(res.headers().location).toBe('/@acme-page')
    }
    expect((await request.get('/org/acme-page-nobody', { maxRedirects: 0 })).status()).toBe(404)
  })

  test('serves the did:web document, and 404 for an unknown organisation', async ({ request }) => {
    const res = await request.get(`/org/${ORG_ID}/did.json`)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/json')
    expect(res.headers()['access-control-allow-origin']).toBe('*')
    expect(res.headers()['cache-control']).toBe('public, s-maxage=60, stale-while-revalidate=60')
    expect(await res.json()).toEqual(DID_DOC)
    expect((await request.get('/org/a0c0ffee-0000-4000-8000-00000000a0ff/did.json')).status()).toBe(404)
    expect((await request.get('/org/bad%20id/did.json')).status()).toBe(404)
    // Archived and taken-down organisations have no DID document (D18).
    expect((await request.get(`/org/${ARCHIVED_ID}/did.json`)).status()).toBe(404)
    expect((await request.get('/org/a0c0ffee-0000-4000-8000-00000000a003/did.json')).status()).toBe(404)
    expect((await request.get(`/org/${BUSY_ID}/did.json`)).status()).toBe(503)
  })

  test('server-side reads carry the visitor IP (D23)', async ({ request }) => {
    await request.get(`/org/${ORG_ID}/did.json`, { headers: { 'x-real-ip': '203.0.113.44' } })
    const sent = (await stubRequests('query OrgDidDocument')).filter((r) => r.variables.orgId === ORG_ID)
    expect(sent.some((r) => r.headers['x-renown-client-ip'] === '203.0.113.44')).toBe(true)
  })

  test('a person’s profile lists the organisations they are a public member of', async ({ page }) => {
    await page.goto('/@lena-member')
    const section = page.getByRole('region', { name: 'Member of' })
    const chip = section.getByRole('link', { name: /Acme Page Works/ })
    await expect(chip).toHaveAttribute('href', '/@acme-page')
    await expect(chip).toContainText('Publisher')
  })
})
