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
  OrgSummary,
} from '../../services/orgs'
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
