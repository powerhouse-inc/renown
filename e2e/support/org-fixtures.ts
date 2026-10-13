// Organisation data for the org specs and the layout guards, and a helper that
// answers the browser's renown-orgs reads by operation name in the page
// (parallel-safe; server-side reads use fixtureStub with unique variables).
import type { Page, Route } from '@playwright/test'
import type {
  Organization,
  OrgCard,
  OrgInvite,
  OrgInviteLink,
  OrgMember,
  OrgMembership,
  OrgRole,
  OrgProposal,
  OrgSummary,
} from '../../services/orgs'
import type {
  AppTransfer,
  OrgAuditEntry,
  OrgCredential,
  OrgDomain,
  OrgOidcClient,
  OrgReport,
  OrgWebhook,
  OrgWebhookDelivery,
  OrgWorkload,
  ReleaseAttestation,
} from '../../services/org-security'
import type { RenownAppProfile } from '../../services/app-profiles'
import { fixtureStub, STUB_SWITCHBOARD_URL } from './stub-switchboard-client'

export const APP_DID_A = 'did:key:z6MkAcmeFixtureAppAxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
export const APP_DID_B = 'did:key:z6MkAcmeFixtureAppBxxxxxxxxxxxxxxxxxxxxxxxxxxx2'
const AT = '2026-10-01T10:00:00.000Z'

export function orgSummary(over: Partial<OrgSummary> = {}): OrgSummary {
  const id = over.id ?? 'org-fixture'
  return { id, did: `did:web:www.renown.id:org:${id}`, handle: 'acme', name: 'Acme', avatar: null, verifiedDomains: [], ...over }
}

export function organization(over: Partial<Organization> = {}): Organization {
  return {
    ...orgSummary(over),
    bio: null,
    website: null,
    links: [],
    listed: true,
    membersPublic: true,
    archived: false,
    takenDown: false,
    createdBy: '0x0a00000000000000000000000000000000000001',
    createdAt: AT,
    updatedAt: AT,
    notAffiliatedWith: null,
    ownerCount: 2,
    memberCount: 3,
    securityWarnings: [],
    apps: [],
    teams: [],
    viewerMembership: null,
    ...over,
  }
}

export function membership(orgId: string, address: string, role: OrgRole, over: Partial<OrgMembership> = {}): OrgMembership {
  const all = role === 'OWNER' || role === 'ADMIN'
  return {
    orgId,
    address: address.toLowerCase(),
    role,
    status: 'ACTIVE',
    appScope: { all, appDids: [] },
    effectiveScope: { all, appDids: [] },
    teams: [],
    ...over,
  }
}

export function orgMember(over: Partial<OrgMember> & { address: string }): OrgMember {
  return {
    id: `m-${over.address.slice(2, 10)}`,
    orgId: 'org-fixture',
    role: 'MEMBER',
    status: 'ACTIVE',
    appScope: { all: false, appDids: [] },
    hidden: false,
    invitedBy: null,
    invitedAt: AT,
    joinedAt: AT,
    endedAt: null,
    updatedAt: AT,
    expiresAt: null,
    teams: [],
    handle: null,
    displayName: null,
    avatar: null,
    ...over,
    address: over.address.toLowerCase(),
  }
}

export function orgInvite(over: Partial<OrgInvite> & { address: string }): OrgInvite {
  return {
    id: `inv-${over.address.slice(2, 10)}`,
    orgId: 'org-fixture',
    org: orgSummary({ id: over.orgId ?? 'org-fixture' }),
    role: 'MEMBER',
    status: 'INVITED',
    invitedBy: null,
    createdAt: AT,
    expiresAt: '2026-10-15T10:00:00.000Z',
    ...over,
  }
}

export function orgInviteLink(over: Partial<OrgInviteLink> = {}): OrgInviteLink {
  return {
    id: 'link-1',
    orgId: 'org-fixture',
    role: 'MEMBER',
    maxUses: 10,
    uses: 2,
    expiresAt: '2026-10-19T10:00:00.000Z',
    revoked: false,
    createdBy: '0x0a00000000000000000000000000000000000001',
    createdAt: AT,
    ...over,
  }
}

type Answer = (variables: Record<string, unknown>) => unknown

/**
 * Answers the browser's renown-orgs requests whose operation name is in
 * `answers` (the answer is wrapped in { data }); every other request falls back
 * to earlier route handlers, then to the stub switchboard.
 */
export async function serveOrgReads(page: Page, answers: Record<string, Answer>): Promise<void> {
  await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
    const body = route.request().postDataJSON() as { query: string; variables?: Record<string, unknown> }
    const name = /^\s*(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1]
    const answer = name ? answers[name] : undefined
    // fallback, not continue: an earlier handler (another serveOrgReads) may answer it; else the stub does.
    if (!answer) return route.fallback()
    return route.fulfill({ json: { data: answer(body.variables ?? {}) } })
  })
}

/** The bare /orgs listing (server-rendered): one answer shared by every spec that opens /orgs. */
export const DIRECTORY_ORGS: OrgCard[] = [
  {
    ...orgSummary({ id: 'org-dir-1', handle: 'acme-directory', name: 'Acme Directory Works', verifiedDomains: ['acme-directory.example'] }),
    bio: 'Builds the directory every organisation is listed in.',
    memberCount: 12,
    archived: false,
    takenDown: false,
    notAffiliatedWith: null,
  },
  {
    ...orgSummary({ id: 'org-dir-2', handle: 'a-very-long-organisation-handle', name: 'The Extraordinarily Long Named Cooperative of Layout Testers' }),
    bio: 'A long bio that goes on for a while so the card has to clamp it to two lines instead of growing on small screens.',
    memberCount: 1,
    archived: false,
    takenDown: false,
    notAffiliatedWith: orgSummary({ id: 'org-dir-1', handle: 'acme-directory', name: 'Acme Directory Works' }),
  },
]

export async function installDirectoryFixture(): Promise<void> {
  await fixtureStub({
    match: 'query OrgSearch',
    variables: '"query":"",',
    response: { data: { organizationSearch: { items: DIRECTORY_ORGS, next: null } } },
  })
}

export function orgProposal(over: Partial<OrgProposal> & { orgId: string }): OrgProposal {
  return {
    id: 'proposal-1',
    kind: 'CHANGE_HANDLE',
    payload: { address: null, demoteToAdmin: null, appDid: null, toKind: null, toId: null, handle: null, domain: null },
    proposer: '0x0a000000000000000000000000000000000000a1',
    approvals: ['0x0a000000000000000000000000000000000000a1'],
    threshold: 2,
    status: 'PENDING',
    createdAt: AT,
    executableAt: null,
    expiresAt: '2026-10-15T10:00:00.000Z',
    executedAt: null,
    reason: null,
    ...over,
  }
}

export function orgDomain(over: Partial<OrgDomain> = {}): OrgDomain {
  const orgId = over.orgId ?? 'org-fixture'
  const domain = over.domain ?? 'acme.example'
  return {
    id: 'domain-1',
    orgId,
    domain,
    status: 'PENDING',
    verifiedAt: null,
    lastCheckedAt: null,
    failures: 0,
    createdAt: AT,
    txtName: `_renown.${domain}`,
    txtValue: `renown-org=${orgId};token=tok123`,
    wellKnownUrl: `https://${domain}/.well-known/renown.json`,
    wellKnownJson: JSON.stringify({ organizations: [{ id: orgId, token: 'tok123' }] }),
    ...over,
  }
}

export function appTransfer(over: Partial<AppTransfer> = {}): AppTransfer {
  return {
    id: 'transfer-1',
    appDid: APP_DID_A,
    fromKind: 'PERSON',
    fromId: '0x0b000000000000000000000000000000000000b2',
    toKind: 'ORG',
    toId: 'org-fixture',
    status: 'PENDING',
    createdAt: AT,
    expiresAt: '2026-10-15T10:00:00.000Z',
    decidedAt: null,
    decidedBy: null,
    proposalId: null,
    ...over,
  }
}

export function orgCredential(over: Partial<OrgCredential> = {}): OrgCredential {
  const credentialId = over.credentialId ?? 'urn:uuid:00000000-0000-4000-8000-0000000000c1'
  return {
    credentialId,
    documentId: 'doc-cred-1',
    appDid: APP_DID_A,
    issuer: '0x0b000000000000000000000000000000000000b2',
    issuerRole: 'PUBLISHER',
    issuerStatus: 'ACTIVE',
    issuanceDate: AT,
    expirationDate: '2027-10-01T10:00:00.000Z',
    revoked: false,
    status: { credentialId, appDid: APP_DID_A, orgId: 'org-fixture', counts: true, reason: null },
    ...over,
  }
}

export function orgWorkload(over: Partial<OrgWorkload> = {}): OrgWorkload {
  return {
    did: 'did:key:z6MkWorkloadFixturexxxxxxxxxxxxxxxxxxxxxxxxxxxx1',
    repository: 'acme/ledger',
    productionBranch: 'main',
    ownerAddress: '0x0b000000000000000000000000000000000000b2',
    disabled: false,
    createdAt: AT,
    ...over,
  }
}

export function orgWebhook(over: Partial<OrgWebhook> = {}): OrgWebhook {
  return { id: 'hook-1', orgId: 'org-fixture', url: 'https://hooks.acme.example/renown', events: ['member.joined'], enabled: true, consecutiveFailures: 0, createdAt: AT, ...over }
}

export function orgDelivery(over: Partial<OrgWebhookDelivery> = {}): OrgWebhookDelivery {
  return {
    id: 'delivery-1',
    webhookId: 'hook-1',
    eventId: 'event-1',
    eventType: 'member.joined',
    status: 'DELIVERED',
    attempts: 1,
    responseStatus: 200,
    lastError: null,
    createdAt: AT,
    nextAttemptAt: null,
    deliveredAt: AT,
    ...over,
  }
}

export function orgOidcClient(over: Partial<OrgOidcClient> = {}): OrgOidcClient {
  return { clientId: 'client-1', orgId: 'org-fixture', name: 'Acme intranet', redirectUris: ['https://intranet.acme.example/callback'], status: 'ACTIVE', createdAt: AT, ...over }
}

export function auditEntry(over: Partial<OrgAuditEntry> = {}): OrgAuditEntry {
  return { id: 'audit-1', orgId: 'org-fixture', at: AT, actor: '0x0a000000000000000000000000000000000000a1', action: 'inviteOrgMember', details: JSON.stringify({ address: '0x0b000000000000000000000000000000000000b2', role: 'MEMBER' }), ...over }
}

export function orgReport(over: Partial<OrgReport> = {}): OrgReport {
  return {
    id: 'report-1',
    orgId: 'org-fixture',
    org: orgSummary(),
    reporter: '0x0c000000000000000000000000000000000000c3',
    reason: 'IMPERSONATION',
    details: 'Pretends to be the real Acme.',
    status: 'OPEN',
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
    note: null,
    createdAt: AT,
    ...over,
  }
}

export function releaseAttestation(over: Partial<ReleaseAttestation> = {}): ReleaseAttestation {
  return {
    id: 'att-1',
    appDid: APP_DID_A,
    version: '1.4.0',
    artifactDigest: `sha256:${'a'.repeat(64)}`,
    orgId: 'org-fixture',
    signer: '0x0b000000000000000000000000000000000000b2',
    signerRole: 'PUBLISHER',
    signerStillMember: true,
    issuedAt: AT,
    signature: '0x1234',
    createdAt: AT,
    ...over,
  }
}

export function appProfile(over: Partial<RenownAppProfile> & { appDid: string }): RenownAppProfile {
  return {
    documentId: `doc-${over.appDid.slice(-6)}`,
    name: 'Fixture app',
    tagline: null,
    logo: null,
    website: null,
    publisherDid: null,
    description: null,
    category: null,
    logoRef: null,
    coverRef: null,
    links: [],
    ...over,
  }
}

/** Like serveOrgReads, for renown-stats (<switchboard>/graphql/renown-stats). */
export async function serveStatsReads(page: Page, answers: Record<string, Answer>): Promise<void> {
  await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-stats**`, async (route: Route) => {
    const body = route.request().postDataJSON() as { query: string; variables?: Record<string, unknown> }
    const name = /^\s*(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1]
    const answer = name ? answers[name] : undefined
    if (!answer) return route.fallback()
    return route.fulfill({ json: { data: answer(body.variables ?? {}) } })
  })
}
