import { test, expect, type Page, type Route } from '@playwright/test'
import {
  decorativePaintProblems,
  horizontalOverflow,
  overlappingText,
  settle,
  strayDecorativeLayers,
  surfaceProblems,
  trappedFixedElements,
  type SurfaceSpec,
} from './support/layout-invariants'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { EXAMPLE_DATA } from '../lib/verify/examples'
import { RELEASE_DOMAIN, RELEASE_TYPES } from '../lib/verify/attestation'
import { useTheme, type Theme } from './support/site'
import { fixtureStub, STUB_SWITCHBOARD_URL } from './support/stub-switchboard-client'
import { signInTestWallet } from './support/test-session'
import { auditEntry, installDirectoryFixture, organization, orgCredential, orgDomain, orgMember, orgProposal, orgSummary, serveOrgReads } from './support/org-fixtures'
import { openManagePage } from './support/org-manage'

// Layout guards: every public page x 390/1280 px x light/dark, and every
// interactive surface open, must keep the geometric rules in
// e2e/support/layout-invariants.ts. A full-page screenshot of each case is
// attached to the report for a human look (no pixel baselines).
//
// To cover a new page or state, add one line to PAGES or STATES.

const ADDRESS = '0x5e00000000000000000000000000000000001a01'
const APP_DID = 'did:key:z6MkLayoutGuardAppxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
const PROFILE = {
  documentId: 'doc-layout-1',
  username: null,
  ethAddress: ADDRESS,
  userImage: null,
  displayName: 'Lena Layout',
  handle: 'lena-layout',
  bio: 'Checks that every panel keeps its shape, on every screen.',
  links: [{ id: 'l1', label: 'Site', url: 'https://lena.example' }],
  avatar: null,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-10-09T10:00:00.000Z',
}
const APP = {
  appDid: APP_DID,
  documentId: 'doc-layout-app',
  name: 'Layout Ledger',
  tagline: 'Books that balance on every screen',
  logo: null,
  website: 'https://ledger.example',
  publisherDid: `did:pkh:eip155:1:${ADDRESS}`,
  description: 'A ledger app used by the layout guards.',
  category: 'Ledgers',
  logoRef: null,
  coverRef: null,
  links: [],
}

const LAYOUT_ORG_ID = 'a0c0ffee-0000-4000-8000-00000000c001'
// Long name, handle and domain on purpose: the guards must hold for the worst case.
const LAYOUT_ORG = organization({
  id: LAYOUT_ORG_ID,
  did: `did:web:www.renown.id:org:${LAYOUT_ORG_ID}`,
  handle: 'acme-layout',
  name: 'The Extraordinarily Long Named Cooperative of Layout Testers Ltd',
  bio: 'We check that every organisation page keeps its shape, on every screen, in both themes, with long names and longer domains.',
  website: 'https://acme-layout.example',
  links: [{ id: 'l1', label: 'GitHub', url: 'https://github.com/acme-layout' }],
  verifiedDomains: ['a-rather-long-subdomain.acme-layout-verification.example'],
  apps: [{ appDid: APP_DID, addedAt: '2026-10-02T10:00:00.000Z', frozen: false }],
  memberCount: 7,
})
const LAYOUT_INVITE_TOKEN = 'layoutInviteTokenAAAAAAAAAAAAAAAAAAAAAAAAAA'
const LONG_MEMBERS = [
  orgMember({ orgId: LAYOUT_ORG_ID, address: '0x5e00000000000000000000000000000000001b01', role: 'OWNER', displayName: 'Bartholomew Maximilian Featherstonehaugh-Cholmondeley' }),
  orgMember({ orgId: LAYOUT_ORG_ID, address: '0x5e00000000000000000000000000000000001b02', role: 'PUBLISHER', handle: 'a-very-long-handle-of-thirty-c' }),
]
const LAYOUT_ORG_APP = 'did:key:z6MkLayoutAcmeAppxxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
let attestationJson = ''

test.beforeAll(async () => {
  const users = { data: { renownUsers: [PROFILE] } }
  await fixtureStub({ match: 'renownUsers', variables: '"lena-layout"', response: users })
  await fixtureStub({ match: 'renownUsers', variables: ADDRESS, response: users })
  await fixtureStub({ match: 'appProfile(', variables: APP_DID, response: { data: { appProfile: APP } } })
  await fixtureStub({ match: 'appProfilesByPublisher(', variables: ADDRESS, response: { data: { appProfilesByPublisher: [APP] } } })
  await installDirectoryFixture()
  await fixtureStub({ match: 'query OrgByRef', variables: '"acme-layout"', response: { data: { organization: LAYOUT_ORG } } })
  await fixtureStub({
    match: 'query OrganizationStats',
    variables: LAYOUT_ORG_ID,
    response: { data: { organizationStats: { orgId: LAYOUT_ORG_ID, apps: 1, activeUsers30d: 123456, activeDelegations: 42, attestations30d: 7 } } },
  })
  await fixtureStub({ match: 'query AppProfilesByOrg', variables: LAYOUT_ORG_ID, response: { data: { appProfiles: { items: [APP], next: null } } } })
  await fixtureStub({ match: 'query AppProfile(', variables: LAYOUT_ORG_APP, response: { data: { appProfile: { ...APP, appDid: LAYOUT_ORG_APP, documentId: 'doc-layout-org-app', name: 'An Organisation App With A Rather Long Name', publisherDid: LAYOUT_ORG.did } } } })
  await fixtureStub({
    match: 'query AppProvenance',
    variables: LAYOUT_ORG_APP,
    response: {
      data: {
        appProfile: {
          frozen: true,
          supportContact: 'a-very-long-support-mailbox-name@acme-layout-verification.example',
          securityContact: 'https://acme-layout-verification.example/a/long/security/disclosure/path',
          publisherOrg: { id: LAYOUT_ORG_ID, did: LAYOUT_ORG.did, handle: 'acme-layout', name: LAYOUT_ORG.name, verifiedDomains: LAYOUT_ORG.verifiedDomains },
        },
      },
    },
  })
  await fixtureStub({ match: 'query OrgByRef', variables: `"id":"${LAYOUT_ORG_ID}"`, response: { data: { organization: LAYOUT_ORG } } })
  const signer = privateKeyToAccount(generatePrivateKey())
  const message = { appDid: APP_DID, version: '12.40.3-beta.7', artifactDigest: `sha256:${'c'.repeat(64)}`, orgId: '', issuedAt: '2026-10-12T10:00:00.000Z' }
  const signature = await signer.signTypedData({ domain: RELEASE_DOMAIN, types: RELEASE_TYPES, primaryType: 'ReleaseAttestation', message })
  attestationJson = JSON.stringify({ ...message, signer: signer.address, signature }, null, 2)
  await fixtureStub({ match: 'query OrgMembers', variables: LAYOUT_ORG_ID, response: { data: { organizationMembers: LONG_MEMBERS } } })
  await fixtureStub({
    match: 'query OrgInviteLinkPreview',
    variables: LAYOUT_INVITE_TOKEN,
    response: {
      data: {
        orgInviteLink: {
          org: orgSummary({ id: LAYOUT_ORG_ID, handle: 'acme-layout', name: LAYOUT_ORG.name, verifiedDomains: LAYOUT_ORG.verifiedDomains }),
          role: 'PUBLISHER',
          expiresAt: '2036-10-19T10:00:00.000Z',
          expired: false,
          revoked: false,
          full: false,
          usable: true,
        },
      },
    },
  })
})

/** /me for a signed-in test wallet with one connected app, answered in the browser (parallel-safe). */
async function openSignedInMe(page: Page): Promise<void> {
  const wallet = await signInTestWallet(page)
  const issuerId = `did:pkh:eip155:1:${wallet.address.toLowerCase()}`
  const day = 86_400_000
  await page.route(`${STUB_SWITCHBOARD_URL}/graphql**`, async (route: Route) => {
    const { query } = route.request().postDataJSON() as { query: string }
    if (query.includes('renownCredentials')) {
      return route.fulfill({
        json: {
          data: {
            renownCredentials: [
              {
                documentId: 'doc-layout-cred',
                credentialId: 'urn:uuid:layout-cred',
                issuerId,
                issuanceDate: new Date(Date.now() - 2 * day).toISOString(),
                expirationDate: new Date(Date.now() + 5 * day).toISOString(),
                credentialSubjectId: APP_DID,
                credentialSubjectApp: 'layout',
                revoked: false,
              },
            ],
          },
        },
      })
    }
    if (query.includes('SubjectAppProfiles')) return route.fulfill({ json: { data: { p0: APP } } })
    if (query.includes('renownUsers')) {
      return route.fulfill({ json: { data: { renownUsers: [{ ...PROFILE, documentId: 'doc-layout-me', ethAddress: wallet.address.toLowerCase() }] } } })
    }
    return route.continue()
  })
  await page.goto('/me')
  await expect(page.getByRole('heading', { level: 2, name: 'Connected apps' })).toBeVisible({ timeout: 30_000 })
}

/** A Renown session stand-in (NEXT_PUBLIC_E2E_AUTH=1) whose browser wallet shows another account. */
async function standInSwitchedWallet(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.__renownE2eSession = { address: '0x5e00000000000000000000000000000000001a02', calls: [] }
    // This browser's wallet was seen on the session's account before (components/site/account-switch-prompt.tsx).
    localStorage.setItem('renown:injected-session:0x5e00000000000000000000000000000000001a02', '1')
    w.ethereum = {
      request: async () => ['0x5e00000000000000000000000000000000001a03'],
      on: () => undefined,
      removeListener: () => undefined,
    }
  })
}

interface LayoutPage {
  name: string
  /** Loads the page and waits until it shows its content. */
  open: (page: Page) => Promise<void>
}

/** The members page for a signed-in owner of a long-named organisation (reads answered in the browser). */
async function openSignedInManage(page: Page): Promise<void> {
  await openManagePage(page, { role: 'OWNER', section: 'members', org: { name: LAYOUT_ORG.name, teams: [{ id: 't1', orgId: 'x', slug: 'core-platform-and-infrastructure', name: 'Core platform and infrastructure', appDids: [APP_DID], memberAddresses: [] }] } })
  await expect(page.getByRole('list', { name: 'Members' })).toBeVisible({ timeout: 30_000 })
}

/** The inbox for a stand-in session, with long notifications. */
async function openNotifications(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.__renownE2eSession = { address: '0x5e00000000000000000000000000000000001c01', calls: [] }
    w.__renownE2eBearer = 'e2e-layout-bearer'
  })
  const org = orgSummary({ id: LAYOUT_ORG_ID, handle: 'acme-layout', name: LAYOUT_ORG.name })
  const at = '2026-10-12T10:00:00.000Z'
  await serveOrgReads(page, {
    MyUnreadNotificationCount: () => ({ myUnreadNotificationCount: 12 }),
    MyNotifications: () => ({
      myNotifications: {
        items: [
          { id: 'n1', kind: 'RECOVERY_STARTED', orgId: LAYOUT_ORG_ID, org, payload: JSON.stringify({ kind: 'RECOVER', domain: LAYOUT_ORG.verifiedDomains[0] }), createdAt: at, readAt: null },
          { id: 'n2', kind: 'INVITED', orgId: LAYOUT_ORG_ID, org, payload: JSON.stringify({ role: 'PUBLISHER' }), createdAt: at, readAt: at },
        ],
        next: null,
      },
    }),
  })
  await page.goto('/notifications')
  await expect(page.getByRole('list', { name: 'Notifications' })).toBeVisible({ timeout: 30_000 })
}

const openSection = (label: string) => async (page: Page): Promise<SurfaceSpec> => {
  await page.getByRole('navigation', { name: 'Organisation settings' }).getByRole('link', { name: label }).click()
  const heading = page.getByRole('heading', { level: 2, name: label })
  await expect(heading).toBeVisible({ timeout: 30_000 })
  return { panel: heading.locator('xpath=..') }
}

const createInviteLink = async (page: Page): Promise<SurfaceSpec> => {
  await page.route('**/api/org/createOrgInviteLink', (route) =>
    route.fulfill({
      json: {
        data: {
          link: { id: 'l1', orgId: LAYOUT_ORG_ID, role: 'MEMBER', maxUses: 10, uses: 0, expiresAt: '2036-10-19T10:00:00.000Z', revoked: false, createdBy: '0x', createdAt: '2026-10-12T10:00:00.000Z' },
          token: 'layoutCreatedTokenAAAAAAAAAAAAAAAAAAAAAAAAA',
        },
      },
    }),
  )
  await page.getByRole('button', { name: 'Create invite link' }).click()
  const panel = page.getByRole('region', { name: 'New invite link' })
  await expect(panel).toBeVisible({ timeout: 30_000 })
  return { panel }
}

/** The site chrome's stand-in session with memberships of long-named organisations. */
async function standInMenuSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.__renownE2eSession = { address: '0x5e00000000000000000000000000000000001d01', calls: [] }
    w.__renownE2eBearer = 'e2e-layout-bearer'
  })
  await serveOrgReads(page, {
    OrgsByMember: () => ({
      organizationsByMember: [
        { role: 'OWNER', hidden: false, org: { ...orgSummary({ id: 'org-layout-menu-1', handle: 'acme-layout', name: LAYOUT_ORG.name }), archived: false } },
        { role: 'PUBLISHER', hidden: false, org: { ...orgSummary({ id: 'org-layout-menu-2', handle: 'beta-layout', name: 'Beta' }), archived: false } },
      ],
    }),
  })
}

const openAccountMenu = async (page: Page): Promise<SurfaceSpec> => {
  await page.getByRole('button', { name: /Account menu/ }).click()
  const panel = page.getByRole('menu', { name: 'Account' })
  await expect(panel.getByRole('menuitem', { name: /Beta/ })).toBeVisible({ timeout: 30_000 })
  return { panel }
}

/** Every B2 section's reads, answered with long values (registered before the manage page opens). */
async function serveSecurityReads(page: Page): Promise<void> {
  const blank = { address: null, demoteToAdmin: null, appDid: null, toKind: null, toId: null, handle: null, domain: null }
  const later = new Date(Date.now() + 2 * 86_400_000).toISOString()
  await serveOrgReads(page, {
    OrgProposals: (v) => ({
      orgProposals: [
        orgProposal({ orgId: String(v.orgId), kind: 'CHANGE_HANDLE', payload: { ...blank, handle: 'a-very-long-handle-of-thirty-c' }, executableAt: later, expiresAt: new Date(Date.now() + 10 * 86_400_000).toISOString() }),
        orgProposal({ orgId: String(v.orgId), id: 'p2', kind: 'RECOVER', payload: { ...blank, address: '0x5e00000000000000000000000000000000001e01', domain: LAYOUT_ORG.verifiedDomains[0] }, status: 'CANCELLED' }),
      ],
    }),
    OrgCredentials: () => ({ orgCredentials: [orgCredential({ appDid: APP_DID }), orgCredential({ credentialId: 'urn:uuid:00000000-0000-4000-8000-0000000000e2', appDid: APP_DID, status: { credentialId: 'x', appDid: APP_DID, orgId: 'o', counts: false, reason: 'ISSUER_NOT_PUBLISHER' } })] }),
    OrgWorkloads: () => ({ orgWorkloads: [] }),
    OrgDomains: (v) => ({ orgDomains: [orgDomain({ orgId: String(v.orgId), domain: LAYOUT_ORG.verifiedDomains[0] })] }),
    OrgWebhooks: () => ({ orgWebhooks: [] }),
    OrgOidcClients: () => ({ orgOidcClients: [] }),
    OrgAuditLog: () => ({ orgAuditLog: { items: [auditEntry({ details: JSON.stringify({ handle: 'a-very-long-handle-of-thirty-c', reason: 'A long reason that the table has to wrap instead of widening the page' }) })], next: null } }),
    AppTransfers: () => ({ appTransfers: [] }),
  })
}

const openReportDialog = async (page: Page): Promise<SurfaceSpec> => {
  await page.getByRole('button', { name: 'Report', exact: true }).click()
  const panel = page.getByRole('dialog', { name: `Report ${LAYOUT_ORG.name}` })
  await expect(panel.getByRole('button', { name: /Sign in to report|Send report/ })).toBeVisible({ timeout: 30_000 })
  return { panel, overlay: panel.locator('xpath=..') }
}

const visit = (path: string, heading: string) => async (page: Page) => {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({ timeout: 30_000 })
}

const PAGES: LayoutPage[] = [
  { name: 'home', open: visit('/', 'One identity for the Powerhouse network') },
  { name: 'apps', open: visit('/apps', 'Apps on Renown') },
  { name: 'developers', open: visit('/developers', 'Build with Renown') },
  { name: 'trust', open: visit('/trust', 'Check how Renown works, not just what we say') },
  { name: 'ecosystem', open: visit('/ecosystem', 'One identity across the Powerhouse network') },
  { name: 'profile', open: visit('/@lena-layout', 'Lena Layout') },
  { name: 'app', open: visit(`/app/${APP_DID}`, 'Layout Ledger') },
  { name: 'me', open: openSignedInMe },
  { name: 'verify', open: visit('/verify', 'Check who signed it') },
  { name: 'people', open: visit('/people', 'People on Renown') },
  { name: 'orgs', open: visit('/orgs', 'Organisations on Renown') },
  { name: 'org', open: visit('/@acme-layout', LAYOUT_ORG.name) },
  { name: 'invite', open: visit(`/invite/${LAYOUT_INVITE_TOKEN}`, `Join ${LAYOUT_ORG.name}`) },
  { name: 'org-manage', open: openSignedInManage },
  { name: 'org-app', open: visit(`/app/${LAYOUT_ORG_APP}`, 'An Organisation App With A Rather Long Name') },
  { name: 'apps-by-org', open: visit('/apps?org=acme-layout', 'Apps on Renown') },
  { name: 'notifications', open: openNotifications },
]

interface LayoutState {
  name: string
  /** A name from PAGES. */
  page: string
  widths: readonly number[]
  /** Runs before the page loads (init scripts). */
  prepare?: (page: Page) => Promise<void>
  /** The state is content in the page, not an overlay: the surface rules (opaque panel, overlay) do not apply, only the page-wide ones. */
  inline?: boolean
  /** Opens the surface and returns what it must satisfy. */
  open: (page: Page) => Promise<SurfaceSpec>
}

const openSheet = (button: string, region: string) => async (page: Page): Promise<SurfaceSpec> => {
  await page.getByRole('button', { name: button, exact: true }).first().click()
  const panel = page.getByRole('region', { name: region }).first()
  await expect(panel).toBeVisible()
  return { panel }
}

/** The example credential as the registry stores it, so the page's lookups find it (genuine). */
function storedExample() {
  const c = EXAMPLE_DATA.credential as unknown as {
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
  }
}

/** /verify's public lookups, answered in the browser: the registry holds the example credential, or is down. */
const serveRegistry = (down = false) => async (page: Page) => {
  await page.route(`${STUB_SWITCHBOARD_URL}/graphql**`, async (route: Route) => {
    const body = route.request().postDataJSON() as { query: string; variables: Record<string, string> }
    if (down) return route.fulfill({ status: 500, body: 'down' })
    if (body.query.includes('VerifyCredentialById')) {
      return route.fulfill({ json: { data: { renownCredentials: [storedExample()].filter((c) => c.credentialId === body.variables.id) } } })
    }
    if (body.query.includes('VerifyDelegation')) return route.fulfill({ json: { data: { renownCredentials: [storedExample()] } } })
    return route.continue()
  })
}

const verifyInput = (page: Page) => page.getByRole('textbox', { name: 'Paste a DID, credential, token or signed operation' })

/** Pastes `text`, checks it, and returns the report region that shows the verdict. */
const checkText = (text: string, verdict: string) => async (page: Page): Promise<SurfaceSpec> => {
  // Typing before hydration is lost, and Check enables only once React saw the text (the header's Sign in button hides in the drawer at 390).
  await expect(async () => {
    await verifyInput(page).fill(text)
    await expect(page.getByRole('button', { name: 'Check', exact: true })).toBeEnabled({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  const heading = page.locator('#verify-verdict')
  await expect(heading).toHaveText(verdict, { timeout: 30_000 })
  return { panel: page.locator('section[data-kind]').filter({ has: heading }) }
}

const longPeople = [
  { handle: 'a-very-long-handle-of-forty-characters-x', displayName: 'Bartholomew Maximilian Featherstonehaugh-Cholmondeley the Third' },
  { handle: 'short', displayName: 'Short Name' },
].map((p, i) => ({
  documentId: `doc-layout-person-${i}`,
  ethAddress: `0x5e0000000000000000000000000000000000${String(i).padStart(4, '0')}`,
  username: null,
  bio: 'A long bio that goes on for a while so the card has to clamp it to two lines instead of growing, on every screen size we support.',
  avatar: null,
  userImage: null,
  ...p,
}))

/** /people's browser-side search, answered here: every query finds the long-handle people. */
async function servePeopleSearch(page: Page): Promise<void> {
  await page.route(`${STUB_SWITCHBOARD_URL}/graphql**`, async (route: Route) => {
    const { query } = route.request().postDataJSON() as { query: string }
    if (!query.includes('renownUserSearch')) return route.continue()
    return route.fulfill({ json: { data: { renownUserSearch: { items: longPeople, next: null } } } })
  })
}

const searchPeople = (text: string) => async (page: Page): Promise<SurfaceSpec> => {
  await expect(page.getByRole('button', { name: 'Sign in to list yourself' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('searchbox', { name: 'Search people by name or handle' }).fill(text)
  const list = page.getByRole('list', { name: 'People' })
  await expect(list.getByRole('listitem')).toHaveCount(longPeople.length)
  return { panel: list }
}

const openMenu = async (page: Page): Promise<SurfaceSpec> => {
  await page.getByRole('button', { name: 'Open menu' }).click()
  const panel = page.getByRole('dialog', { name: 'Menu' })
  await expect(panel).toBeVisible()
  return { panel, overlay: panel.locator('xpath=..') }
}

const STATES: LayoutState[] = [
  { name: 'mobile menu open', page: 'verify', widths: [390], open: openMenu },
  { name: 'mobile menu open', page: 'people', widths: [390], open: openMenu },
  { name: 'mobile menu open', page: 'org', widths: [390], open: openMenu },
  { name: 'teams section', inline: true, page: 'org-manage', widths: [390, 1280], open: openSection('Teams') },
  { name: 'settings section', inline: true, page: 'org-manage', widths: [390, 1280], open: openSection('Settings') },
  { name: 'apps section', inline: true, page: 'org-manage', widths: [390, 1280], prepare: serveSecurityReads, open: openSection('Apps') },
  { name: 'security section', inline: true, page: 'org-manage', widths: [390, 1280], prepare: serveSecurityReads, open: openSection('Security') },
  { name: 'domains section', inline: true, page: 'org-manage', widths: [390, 1280], prepare: serveSecurityReads, open: openSection('Domains') },
  { name: 'webhooks section', inline: true, page: 'org-manage', widths: [390, 1280], prepare: serveSecurityReads, open: openSection('Webhooks') },
  { name: 'sign-in clients section', inline: true, page: 'org-manage', widths: [390, 1280], prepare: serveSecurityReads, open: openSection('Sign-in clients') },
  { name: 'audit log section', inline: true, page: 'org-manage', widths: [390, 1280], prepare: serveSecurityReads, open: openSection('Audit log') },
  { name: 'report dialog open', page: 'org', widths: [390, 1280], open: openReportDialog },
  {
    name: 'release attestation result',
    inline: true,
    page: 'verify',
    widths: [390, 1280],
    open: (page) => checkText(attestationJson, 'Signature valid, but this release is not recorded by Renown')(page),
  },
  { name: 'invite link created', inline: true, page: 'org-manage', widths: [390, 1280], open: createInviteLink },
  { name: 'account menu with organisations', page: 'trust', widths: [1280], prepare: standInMenuSession, open: openAccountMenu },
  {
    name: 'genuine result',
    inline: true,
    page: 'verify',
    widths: [390, 1280],
    prepare: serveRegistry(),
    open: (page) => checkText(JSON.stringify(EXAMPLE_DATA.credential, null, 2), 'Genuine')(page),
  },
  {
    name: 'not genuine result',
    inline: true,
    page: 'verify',
    widths: [390, 1280],
    prepare: serveRegistry(),
    open: (page) => {
      const forged = { ...EXAMPLE_DATA.credential, credentialSubject: { ...EXAMPLE_DATA.credential.credentialSubject, app: 'Something else' } }
      return checkText(JSON.stringify(forged), 'Not genuine')(page)
    },
  },
  {
    name: 'could not check result',
    inline: true,
    page: 'verify',
    widths: [390, 1280],
    prepare: serveRegistry(true),
    open: (page) => checkText(JSON.stringify(EXAMPLE_DATA.credential), 'Could not check')(page),
  },
  { name: 'results with long handles',
    inline: true, page: 'people', widths: [390, 1280], prepare: servePeopleSearch, open: searchPeople('long') },
  {
    name: 'mobile menu open',
    page: 'home',
    widths: [390],
    open: async (page) => {
      await page.getByRole('button', { name: 'Open menu' }).click()
      const panel = page.getByRole('dialog', { name: 'Menu' })
      await expect(panel).toBeVisible()
      return { panel, overlay: panel.locator('xpath=..') }
    },
  },
  { name: 'share sheet open', page: 'profile', widths: [390, 1280], open: openSheet('Share', 'Share') },
  { name: 'verified badge open', page: 'profile', widths: [390, 1280], open: openSheet('Verified Renown identity', 'Verified Renown identity') },
  {
    name: 'revoke dialog open',
    page: 'me',
    widths: [390, 1280],
    open: async (page) => {
      await page.getByRole('region', { name: 'Connected apps' }).getByRole('button', { name: /^Revoke Layout Ledger/ }).click()
      const panel = page.getByRole('dialog', { name: 'Revoke Layout Ledger?' })
      await expect(panel).toBeVisible()
      return { panel }
    },
  },
  {
    name: 'account switch prompt',
    page: 'trust',
    widths: [390, 1280],
    prepare: (page) => standInSwitchedWallet(page),
    open: async (page) => {
      const panel = page.getByRole('region', { name: 'Wallet account changed' })
      await expect(panel).toBeVisible()
      return { panel }
    },
  },
]

const WIDTHS = [390, 1280] as const
const THEMES: Theme[] = ['light', 'dark']

// Pages whose decorative layers the paint check must find (the home call-to-action's glow and frame).
const PAINT_PROBED = new Set(['home'])

/** Every page-wide rule, plus the surface's when one is open. */
async function layoutProblems(page: Page, surface?: SurfaceSpec, pageName?: string, inline = false): Promise<string[]> {
  return [
    ...(await horizontalOverflow(page)),
    ...(await trappedFixedElements(page)),
    ...(await strayDecorativeLayers(page)),
    ...(surface && !inline
      ? await surfaceProblems(page, surface)
      : await decorativePaintProblems(page, { expectProbes: pageName !== undefined && PAINT_PROBED.has(pageName) })),
    ...(await overlappingText(page, surface?.panel)),
  ]
}

test.describe('layout invariants', () => {
  test.beforeEach(() => {
    test.setTimeout(120_000)
  })

  for (const target of PAGES) {
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        test(`${target.name} at ${width} px (${theme})`, async ({ page }, testInfo) => {
          await page.setViewportSize({ width, height: 844 })
          await useTheme(page, theme)
          await target.open(page)
          await settle(page)
          const problems = await layoutProblems(page, undefined, target.name)
          await testInfo.attach(`${target.name}-${width}-${theme}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
          expect(problems).toEqual([])
        })
      }
    }
  }

  for (const state of STATES) {
    const target = PAGES.find((p) => p.name === state.page)!
    for (const width of state.widths) {
      for (const theme of THEMES) {
        test(`${target.name}: ${state.name} at ${width} px (${theme})`, async ({ page }, testInfo) => {
          await page.setViewportSize({ width, height: 844 })
          await useTheme(page, theme)
          await state.prepare?.(page)
          await target.open(page)
          await settle(page)
          const surface = await state.open(page)
          await settle(page)
          const problems = await layoutProblems(page, surface, undefined, state.inline)
          await testInfo.attach(`${target.name}-${state.name.replace(/ /g, '-')}-${width}-${theme}.png`, { body: await page.screenshot(), contentType: 'image/png' })
          expect(problems).toEqual([])
        })
      }
    }
  }
})
