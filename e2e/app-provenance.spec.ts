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
const PUBLISHER_ORG = {
  id: ORG_ID,
  did: ORG_DID,
  handle: 'acme-prov',
  name: 'Acme Provenance',
  verifiedDomains: ['acme-prov.example'],
}

const DID_LEFT = 'did:key:z6MkProvenanceAppRxxxxxxxxxxxxxxxxxxxxxxxxxxxxx3'
const DID_TAKEN = 'did:key:z6MkProvenanceAppSxxxxxxxxxxxxxxxxxxxxxxxxxxxxx4'
const ORG2_ID = 'a0c0ffee-0000-4000-8000-00000000e002'
const ORG2 = {
  id: ORG2_ID,
  did: `did:web:www.renown.id:org:${ORG2_ID}`,
  handle: 'other-prov',
  name: 'Other Provenance',
  verifiedDomains: [],
}
const REAL = {
  id: 'a0c0ffee-0000-4000-8000-00000000e003',
  did: 'did:web:www.renown.id:org:a0c0ffee-0000-4000-8000-00000000e003',
  handle: 'real-acme',
  name: 'Real Acme',
  avatar: null,
  verifiedDomains: ['real-acme.example'],
}
const LEFT_SIGNER = '0x0e000000000000000000000000000000000000e8'

test.beforeAll(async () => {
  await fixtureStub({
    match: 'query AppProfile(',
    variables: DID_LEFT,
    response: {
      data: {
        appProfile: appProfile({
          appDid: DID_LEFT,
          name: 'Lookalike Ledger',
          publisherDid: ORG2.did,
        }),
      },
    },
  })
  await fixtureStub({
    match: 'query AppProvenance',
    variables: DID_LEFT,
    response: {
      data: {
        appProfile: {
          frozen: false,
          supportContact: 'javascript:alert(1)',
          securityContact: null,
          publisherOrg: ORG2,
        },
      },
    },
  })
  await fixtureStub({
    match: 'query OrgByRef',
    variables: `"id":"${ORG2_ID}"`,
    response: { data: { organization: organization({ ...ORG2, notAffiliatedWith: REAL }) } },
  })
  await fixtureStub({
    match: 'query OrgByRef',
    variables: '"other-prov"',
    response: { data: { organization: organization({ ...ORG2 }) } },
  })
  await fixtureStub({
    match: 'query ReleaseAttestations',
    variables: DID_LEFT,
    response: {
      data: {
        releaseAttestations: {
          items: [
            releaseAttestation({
              appDid: DID_LEFT,
              version: '2.0.0',
              signer: LEFT_SIGNER,
              signerRole: 'PUBLISHER',
              signerStillMember: false,
              issuedAt: '2026-09-01T10:00:00.000Z',
            }),
          ],
          next: null,
        },
      },
    },
  })
  await fixtureStub({
    match: 'query AppProfilesByOrg',
    variables: ORG2_ID,
    response: {
      data: {
        appProfiles: {
          items: [appProfile({ appDid: DID_LEFT, name: 'Lookalike Ledger' })],
          next: null,
        },
      },
    },
  })
  await fixtureStub({
    match: 'query AppProfile(',
    variables: DID_TAKEN,
    response: {
      data: {
        appProfile: appProfile({
          appDid: DID_TAKEN,
          name: 'Taken Down Org App',
          publisherDid: 'did:web:www.renown.id:org:gone',
        }),
      },
    },
  })
  await fixtureStub({
    match: 'query AppProvenance',
    variables: DID_TAKEN,
    response: {
      data: {
        appProfile: {
          frozen: true,
          supportContact: null,
          securityContact: null,
          publisherOrg: null,
        },
      },
    },
  })
  await fixtureStub({
    match: 'query OrgByRef',
    variables: '"busy-org"',
    response: graphqlError('Slow down', 'RATE_LIMITED'),
  })
})

test.describe('provenance edge cases', () => {
  test('a signer who left, and a lookalike organisation', async ({ page }) => {
    await page.goto(`/app/${DID_LEFT}`)
    const publisher = page.getByRole('region', { name: 'Publisher' })
    await expect(publisher).toContainText('Release 2.0.0 signed off by')
    await expect(publisher).toContainText(
      'They were a Publisher when signing and are no longer a member.',
    )
    await expect(publisher).not.toContainText('(Publisher)')
    await expect(publisher.getByText('Not affiliated with the verified')).toBeVisible()
    await expect(publisher.getByRole('link', { name: 'Real Acme' })).toHaveAttribute(
      'href',
      '/@real-acme',
    )
    await expect(publisher.getByText('Unverified organisation')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Contact' })).toHaveCount(0)
  })

  test('an app of a taken-down organisation shows no publisher card', async ({ page }) => {
    await page.goto(`/app/${DID_TAKEN}`)
    await expect(page.getByRole('status').filter({ hasText: 'Frozen by' })).toContainText(
      'Frozen by its organisation.',
    )
    await expect(page.getByRole('region', { name: 'Publisher' })).toHaveCount(0)
  })

  test('/apps?org= answers 503 when the organisation read is rate limited', async ({ page }) => {
    const res = await page.goto('/apps?org=busy-org')
    expect(res?.status()).toBe(503)
    expect(res?.headers()['retry-after']).toBe('30')
    await expect(page.getByText('No organisation has the handle')).toHaveCount(0)
  })

  test('client navigation between organisation filters refetches', async ({ page }) => {
    await page.goto('/apps?org=acme-prov')
    await expect(page.getByText('Published by Acme Provenance')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Provenance Ledger' })).toBeVisible()
    await page.evaluate(() =>
      (window as unknown as { next: { router: { push(url: string): void } } }).next.router.push(
        '/apps?org=other-prov',
      ),
    )
    await expect(page.getByText('Published by Other Provenance')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Lookalike Ledger' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Provenance Ledger', exact: true })).toHaveCount(
      0,
    )
    await page.getByRole('link', { name: 'Show all apps' }).first().click()
    await expect(page).toHaveURL(/\/apps$/)
    await expect(page.getByText(/Published by/)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Lookalike Ledger' })).toHaveCount(0)
  })
})

test.beforeAll(async () => {
  for (const did of [DID, DID_OLD]) {
    await fixtureStub({
      match: 'query AppProfile(',
      variables: did,
      response: {
        data: {
          appProfile: appProfile({
            appDid: did,
            name: did === DID ? 'Provenance Ledger' : 'Older Switchboard App',
            publisherDid: ORG_DID,
          }),
        },
      },
    })
  }
  await fixtureStub({
    match: 'query AppProvenance',
    variables: DID,
    response: {
      data: {
        appProfile: {
          frozen: true,
          supportContact: 'support@acme-prov.example',
          securityContact: 'https://acme-prov.example/security',
          publisherOrg: PUBLISHER_ORG,
        },
      },
    },
  })
  await fixtureStub({
    match: 'query AppProvenance',
    variables: DID_OLD,
    response: graphqlError('Cannot query field "frozen" on type "AppProfile".'),
  })
  await fixtureStub({
    match: 'query OrgByRef',
    variables: `"id":"${ORG_ID}"`,
    response: { data: { organization: organization({ ...PUBLISHER_ORG }) } },
  })
  await fixtureStub({
    match: 'query OrgByRef',
    variables: '"acme-prov"',
    response: { data: { organization: organization({ ...PUBLISHER_ORG }) } },
  })
  await fixtureStub({
    match: 'query OrgByRef',
    variables: '"nobody-here"',
    response: { data: { organization: null } },
  })
  await fixtureStub({
    match: 'query ReleaseAttestations',
    variables: DID,
    response: {
      data: {
        releaseAttestations: {
          items: [
            releaseAttestation({
              appDid: DID,
              version: '1.4.0',
              signer: SIGNER,
              signerRole: 'PUBLISHER',
              issuedAt: '2026-10-03T10:00:00.000Z',
            }),
          ],
          next: null,
        },
      },
    },
  })
  await fixtureStub({
    match: 'renownUsers',
    variables: SIGNER,
    response: {
      data: {
        renownUsers: [
          {
            documentId: 'doc-signer',
            username: null,
            ethAddress: SIGNER,
            userImage: null,
            displayName: 'Alice Signer',
            handle: 'alice-signer',
            bio: null,
            links: [],
            avatar: null,
            createdAt: null,
            updatedAt: null,
          },
        ],
      },
    },
  })
  await fixtureStub({
    match: 'query AppProfilesByOrg',
    variables: ORG_ID,
    response: {
      data: {
        appProfiles: {
          items: [appProfile({ appDid: DID, name: 'Provenance Ledger' })],
          next: null,
        },
      },
    },
  })
})

test.describe('contacts and filters', () => {
  test('contacts are an email or an https URL, nothing else', () => {
    expect(contactLink('security@acme.example')).toEqual({
      href: 'mailto:security@acme.example',
      label: 'security@acme.example',
    })
    expect(contactLink('mailto:help@acme.example')).toEqual({
      href: 'mailto:help@acme.example',
      label: 'help@acme.example',
    })
    expect(contactLink('https://acme.example/support')).toEqual({
      href: 'https://acme.example/support',
      label: 'acme.example/support',
    })
    expect(contactLink('http://acme.example')).toBeNull()
    expect(contactLink('javascript:alert(1)')).toBeNull()
    expect(contactLink(null)).toBeNull()
    for (const tricky of [
      'a@b.example?bcc=x%40y.example',
      'a@b.example?cc=x@y.example',
      'mailto:a@b.example?subject=hi',
      'a@b.example%0Abcc:x@y.example',
      'a@b.example&x=1',
    ]) {
      expect(contactLink(tricky), tricky).toBeNull()
    }
    expect(parseOrgParam(' @Acme-Prov ')).toBe('acme-prov')
    expect(parseOrgParam('no')).toBeNull()
  })
})

test.describe('app page provenance', () => {
  test('shows the publishing organisation, the latest sign-off, contacts and the freeze', async ({
    page,
  }) => {
    await page.goto(`/app/${DID}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Provenance Ledger' })).toBeVisible()
    const publisher = page.getByRole('region', { name: 'Publisher' })
    await expect(publisher.getByRole('link', { name: /Acme Provenance/ })).toHaveAttribute(
      'href',
      '/@acme-prov',
    )
    await expect(publisher.getByText('Verified: acme-prov.example')).toBeVisible()
    await expect(publisher).toContainText(
      'Release 1.4.0 signed off by Alice Signer (Publisher) on 3 October 2026.',
    )
    await expect(page.getByRole('status').filter({ hasText: 'Frozen by' })).toContainText(
      'Frozen by Acme Provenance.',
    )
    const contact = page.getByRole('region', { name: 'Contact' })
    await expect(contact.getByRole('link', { name: 'support@acme-prov.example' })).toHaveAttribute(
      'href',
      'mailto:support@acme-prov.example',
    )
    await expect(contact.getByRole('link', { name: 'acme-prov.example/security' })).toHaveAttribute(
      'href',
      'https://acme-prov.example/security',
    )
    const ld = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}',
    )
    expect(ld.publisher).toMatchObject({ '@type': 'Organization', name: 'Acme Provenance' })
  })

  test('still renders when provenance cannot be read', async ({ page }) => {
    const res = await page.goto(`/app/${DID_OLD}`)
    expect(res?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Older Switchboard App' }),
    ).toBeVisible()
    await expect(page.getByText('Frozen by')).toHaveCount(0)
  })
})

test.describe('/apps?org=', () => {
  test('lists one organisation’s apps behind a clearable chip', async ({ page }) => {
    await page.goto('/apps?org=acme-prov')
    await expect(page.getByText('Published by Acme Provenance')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Provenance Ledger' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Show all apps' }).first()).toHaveAttribute(
      'href',
      '/apps',
    )
    await expect(page.getByRole('navigation', { name: 'App categories' })).toHaveCount(0)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })

  test('says when no organisation has the handle', async ({ page }) => {
    await page.goto('/apps?org=nobody-here')
    await expect(page.getByText('No organisation has the handle @nobody-here.')).toBeVisible()
  })
})
