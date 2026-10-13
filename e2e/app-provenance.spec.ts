import { test, expect } from '@playwright/test'
import { contactLink } from '../lib/apps/contacts'
import { parseOrgParam } from '../utils/app-directory'
import { appProfile, organization, releaseAttestation } from './support/org-fixtures'
import { fixtureStub, graphqlError } from './support/stub-switchboard-client'

const ORG_ID = 'a0c0ffee-0000-4000-8000-00000000e001'
const ORG_DID = `did:web:www.renown.id:org:${ORG_ID}`
const DID = 'did:key:z6MkProvenanceAppPxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
const DID_OLD = 'did:key:z6MkProvenanceAppQxxxxxxxxxxxxxxxxxxxxxxxxxxxxx2'
const SIGNER = '0x0e000000000000000000000000000000000000e7'
const PUBLISHER_ORG = { id: ORG_ID, did: ORG_DID, handle: 'acme-prov', name: 'Acme Provenance', verifiedDomains: ['acme-prov.example'] }

test.beforeAll(async () => {
  for (const did of [DID, DID_OLD]) {
    await fixtureStub({ match: 'query AppProfile(', variables: did, response: { data: { appProfile: appProfile({ appDid: did, name: did === DID ? 'Provenance Ledger' : 'Older Switchboard App', publisherDid: ORG_DID }) } } })
  }
  await fixtureStub({
    match: 'query AppProvenance',
    variables: DID,
    response: { data: { appProfile: { frozen: true, supportContact: 'support@acme-prov.example', securityContact: 'https://acme-prov.example/security', publisherOrg: PUBLISHER_ORG } } },
  })
  await fixtureStub({ match: 'query AppProvenance', variables: DID_OLD, response: graphqlError('Cannot query field "frozen" on type "AppProfile".') })
  await fixtureStub({ match: 'query OrgByRef', variables: `"id":"${ORG_ID}"`, response: { data: { organization: organization({ ...PUBLISHER_ORG }) } } })
  await fixtureStub({ match: 'query OrgByRef', variables: '"acme-prov"', response: { data: { organization: organization({ ...PUBLISHER_ORG }) } } })
  await fixtureStub({ match: 'query OrgByRef', variables: '"nobody-here"', response: { data: { organization: null } } })
  await fixtureStub({
    match: 'query ReleaseAttestations',
    variables: DID,
    response: { data: { releaseAttestations: { items: [releaseAttestation({ appDid: DID, version: '1.4.0', signer: SIGNER, signerRole: 'PUBLISHER', issuedAt: '2026-10-03T10:00:00.000Z' })], next: null } } },
  })
  await fixtureStub({
    match: 'renownUsers',
    variables: SIGNER,
    response: { data: { renownUsers: [{ documentId: 'doc-signer', username: null, ethAddress: SIGNER, userImage: null, displayName: 'Alice Signer', handle: 'alice-signer', bio: null, links: [], avatar: null, createdAt: null, updatedAt: null }] } },
  })
  await fixtureStub({ match: 'query AppProfilesByOrg', variables: ORG_ID, response: { data: { appProfiles: { items: [appProfile({ appDid: DID, name: 'Provenance Ledger' })], next: null } } } })
})

test.describe('contacts and filters', () => {
  test('contacts are an email or an https URL, nothing else', () => {
    expect(contactLink('security@acme.example')).toEqual({ href: 'mailto:security@acme.example', label: 'security@acme.example' })
    expect(contactLink('mailto:help@acme.example')).toEqual({ href: 'mailto:help@acme.example', label: 'help@acme.example' })
    expect(contactLink('https://acme.example/support')).toEqual({ href: 'https://acme.example/support', label: 'acme.example/support' })
    expect(contactLink('http://acme.example')).toBeNull()
    expect(contactLink('javascript:alert(1)')).toBeNull()
    expect(contactLink(null)).toBeNull()
    expect(parseOrgParam(' @Acme-Prov ')).toBe('acme-prov')
    expect(parseOrgParam('no')).toBeNull()
  })
})

test.describe('app page provenance', () => {
  test('shows the publishing organisation, the latest sign-off, contacts and the freeze', async ({ page }) => {
    await page.goto(`/app/${DID}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Provenance Ledger' })).toBeVisible()
    const publisher = page.getByRole('region', { name: 'Publisher' })
    await expect(publisher.getByRole('link', { name: /Acme Provenance/ })).toHaveAttribute('href', '/@acme-prov')
    await expect(publisher.getByText('Verified: acme-prov.example')).toBeVisible()
    await expect(publisher).toContainText('Release 1.4.0 signed off by Alice Signer (Publisher) on 3 October 2026.')
    await expect(page.getByRole('status').filter({ hasText: 'Frozen by' })).toContainText('Frozen by Acme Provenance.')
    const contact = page.getByRole('region', { name: 'Contact' })
    await expect(contact.getByRole('link', { name: 'support@acme-prov.example' })).toHaveAttribute('href', 'mailto:support@acme-prov.example')
    await expect(contact.getByRole('link', { name: 'acme-prov.example/security' })).toHaveAttribute('href', 'https://acme-prov.example/security')
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}')
    expect(ld.publisher).toMatchObject({ '@type': 'Organization', name: 'Acme Provenance' })
  })

  test('still renders when provenance cannot be read', async ({ page }) => {
    const res = await page.goto(`/app/${DID_OLD}`)
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Older Switchboard App' })).toBeVisible()
    await expect(page.getByText('Frozen by')).toHaveCount(0)
  })
})

test.describe('/apps?org=', () => {
  test('lists one organisation’s apps behind a clearable chip', async ({ page }) => {
    await page.goto('/apps?org=acme-prov')
    await expect(page.getByText('Published by Acme Provenance')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Provenance Ledger' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Show all apps' }).first()).toHaveAttribute('href', '/apps')
    await expect(page.getByRole('navigation', { name: 'App categories' })).toHaveCount(0)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })

  test('says when no organisation has the handle', async ({ page }) => {
    await page.goto('/apps?org=nobody-here')
    await expect(page.getByText('No organisation has the handle @nobody-here.')).toBeVisible()
  })
})
