import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { buildSchema, parse, validate } from 'graphql'
import { GraphQLClient } from 'graphql-request'
import { isOrgErrorCode, orgErrorText, statusForOrgError } from '../lib/orgs/errors'
import { handleFromName, orgHandleProblem, orgRef } from '../lib/orgs/handles'
import { argsProblem, isOrgMutationName, mutationDocument, ORG_MUTATIONS, type OrgMutationName } from '../services/org-mutations'
import { canonicalJson, ORG_ROLES, orgMessage, parseOrgRole, roleAtLeast } from '../services/org-signed-messages'
import * as orgs from '../services/orgs'
import { isOrgRateLimited, isOrgSearchable, OrgApiError, orgsRequest, parseOrgQuery, serverReadHeaders, toOrgApiError } from '../services/orgs'
import { fixtureStub, graphqlError, STUB_SWITCHBOARD_URL, stubRequests } from './support/stub-switchboard-client'

// Runs in the Playwright worker (Node). The message vectors are renown-package's
// (docs/superpowers/plans/2026-10-12-orgs-a1-core.md, Task 3, sdk/tests/orgs.test.ts):
// a drift here makes every signed organisation write FORBIDDEN.
const TS = '2026-10-12T12:00:00.000Z'
const ORGS = `${STUB_SWITCHBOARD_URL}/graphql/renown-orgs`

test.describe('org signed messages', () => {
  test('ranks roles OWNER > ADMIN > PUBLISHER > MEMBER, case-insensitively', () => {
    expect(ORG_ROLES).toEqual(['OWNER', 'ADMIN', 'PUBLISHER', 'MEMBER'])
    expect(roleAtLeast('OWNER', 'ADMIN')).toBe(true)
    expect(roleAtLeast('publisher', 'PUBLISHER')).toBe(true)
    expect(roleAtLeast('MEMBER', 'publisher')).toBe(false)
    expect(roleAtLeast('ROOT', 'MEMBER')).toBe(false)
    expect(parseOrgRole(' admin ')).toBe('ADMIN')
    expect(parseOrgRole('toString')).toBeNull()
  })

  test('canonical JSON sorts keys recursively, drops undefined and keeps null', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: null }], c: 'x' }, u: undefined })).toBe(
      '{"a":{"c":"x","d":[3,{"y":null,"z":1}]},"b":1}',
    )
    expect(canonicalJson([undefined, 'a'])).toBe('[null,"a"]')
    expect(canonicalJson({})).toBe('{}')
  })

  test('orgMessage matches the backend vectors byte for byte', async () => {
    expect(await orgMessage('createOrganization', null, { handle: 'acme', name: 'Acme Inc.' }, TS)).toBe(
      `Renown organization createOrganization - 51fc9dfbed0da2cbf914335bc158a6279d52f9f56fc9746e77140b1821312231 at ${TS}`,
    )
    expect(await orgMessage('inviteOrgMember', 'org-1', { orgId: 'org-1', invitee: 'bob', role: 'PUBLISHER' }, TS)).toBe(
      `Renown organization inviteOrgMember org-1 ceab60b2f8e9d6c45925d6a2f756b98de0945072e24146e7a46ca907cdc57ec0 at ${TS}`,
    )
    expect(await orgMessage('leaveOrganization', 'org-1', { orgId: 'org-1' }, TS)).toBe(
      `Renown organization leaveOrganization org-1 44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a at ${TS}`,
    )
    expect(
      await orgMessage(
        'setOrgMemberAppScope',
        'org-1',
        {
          orgId: 'org-1',
          address: '0xb0b0000000000000000000000000000000000002',
          appScope: { appDids: ['did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'], all: false },
        },
        TS,
      ),
    ).toBe(`Renown organization setOrgMemberAppScope org-1 d4e9d9d8ff152bca70736879229c7fd17b5916de16de6964dae4c1fcf437b405 at ${TS}`)
    expect(
      await orgMessage('acceptOrgInviteLink', undefined, { token: 'abc', auth: { address: '0x1', signature: '0x', timestamp: TS } }, TS),
    ).toBe(`Renown organization acceptOrgInviteLink - 9c5955952c12f09397bd7fcf56624bea656322913fd00d884661c3b126d17a28 at ${TS}`)
  })
})

test.describe('org mutation registry', () => {
  test('builds a named mutation with every argument and auth', () => {
    expect(mutationDocument('inviteOrgMember')).toBe(
      'mutation InviteOrgMember($orgId: String!, $invitee: String!, $role: OrgRole!, $auth: OrgAuthInput) { inviteOrgMember(orgId: $orgId, invitee: $invitee, role: $role, auth: $auth) { id orgId org { id did handle name avatar verifiedDomains } address role status invitedBy createdAt expiresAt } }',
    )
    expect(mutationDocument('leaveOrganization')).toBe(
      'mutation LeaveOrganization($orgId: String!, $auth: OrgAuthInput) { leaveOrganization(orgId: $orgId, auth: $auth) }',
    )
  })

  test('every registered document is valid GraphQL', () => {
    for (const name of Object.keys(ORG_MUTATIONS) as OrgMutationName[]) {
      expect(() => parse(mutationDocument(name)), name).not.toThrow()
    }
  })

  test('knows only registered mutations and names the first bad argument', () => {
    expect(isOrgMutationName('inviteOrgMember')).toBe(true)
    expect(isOrgMutationName('toString')).toBe(false)
    expect(isOrgMutationName('resolveOrgReport')).toBe(false)
    expect(argsProblem('inviteOrgMember', { orgId: 'o', invitee: 'bob', role: 'MEMBER' })).toBeNull()
    expect(argsProblem('inviteOrgMember', { orgId: 'o', invitee: 'bob' })).toBe('role')
    expect(argsProblem('inviteOrgMember', { orgId: 'o', invitee: 'bob', role: null })).toBe('role')
    expect(argsProblem('inviteOrgMember', { orgId: 'o', invitee: 'bob', role: 'MEMBER', auth: {} })).toBe('auth')
    expect(argsProblem('updateOrganization', { orgId: 'o', bio: null })).toBeNull()
  })
})

test.describe('org helpers', () => {
  test('handles: problems, suggestions and references', () => {
    expect(orgHandleProblem('')).toBe('Choose a handle.')
    expect(orgHandleProblem('ab')).toMatch(/3 to 30/)
    expect(orgHandleProblem('Acme')).toMatch(/3 to 30/)
    expect(orgHandleProblem('invite')).toBe('This handle is reserved.')
    expect(orgHandleProblem('acme-labs')).toBeNull()
    expect(handleFromName('  Acme Inc. — Zürich  ')).toBe('acme-inc-zurich')
    expect(handleFromName('A')).toBe('')
    expect(handleFromName('x'.repeat(40))).toBe('x'.repeat(30))
    expect(orgRef('Acme-Labs')).toEqual({ handle: 'acme-labs' })
    expect(orgRef('7f2c1a9e-0b6d-4c1e-9a55-3c2f6f1d2b10')).toEqual({ id: '7f2c1a9e-0b6d-4c1e-9a55-3c2f6f1d2b10' })
  })

  test('directory query: trimmed, capped at 40, searchable when blank or 2+', () => {
    expect(parseOrgQuery(['  acme  ', 'x'])).toBe('acme')
    expect(parseOrgQuery('x'.repeat(50))).toBe('x'.repeat(40))
    expect(isOrgSearchable('')).toBe(true)
    expect(isOrgSearchable('a')).toBe(false)
    expect(isOrgSearchable('ac')).toBe(true)
  })

  test('errors: HTTP status and text', () => {
    expect(isOrgErrorCode('LAST_OWNER')).toBe(true)
    expect(isOrgErrorCode('DECLINED')).toBe(false)
    expect(statusForOrgError('BAD_USER_INPUT')).toBe(400)
    expect(statusForOrgError('LAST_OWNER')).toBe(409)
    expect(statusForOrgError('RATE_LIMITED')).toBe(429)
    expect(statusForOrgError('SERVICE_UNAVAILABLE')).toBe(503)
    expect(statusForOrgError('NETWORK')).toBe(502)
    expect(orgErrorText('BAD_USER_INPUT', ' The handle is malformed ')).toBe('The handle is malformed')
    expect(orgErrorText('FORBIDDEN', 'signature already used')).toBe('This request was already sent. Reload to see the result.')
    expect(orgErrorText('FORBIDDEN', 'The organization is archived or taken down')).toBe('This organisation can no longer be changed.')
    expect(orgErrorText('FORBIDDEN', 'Forbidden')).toMatch(/device clock/)
    expect(orgErrorText('LAST_OWNER', 'ignored')).toBe('An organisation always needs an owner. Add another owner first.')
  })
})

test.describe('orgsRequest', () => {
  test('maps GraphQL error codes and fields', async () => {
    await fixtureStub({ id: 'org-client', match: 'OrgClientProbe', variables: 'org-client-1', response: graphqlError('Only one owner left', 'LAST_OWNER') })
    await fixtureStub({ id: 'org-client', match: 'OrgClientProbe', variables: 'org-client-2', response: graphqlError('Bad handle', 'BAD_USER_INPUT', { field: 'handle' }) })
    const probe = 'query OrgClientProbe($id: String) { organization(id: $id) { id } }'
    const last = await orgsRequest(probe, { id: 'org-client-1' }, { endpoint: ORGS }).catch((e: unknown) => e)
    expect(last).toBeInstanceOf(OrgApiError)
    expect(last).toMatchObject({ code: 'LAST_OWNER', field: null, message: 'Only one owner left' })
    const bad = await orgsRequest(probe, { id: 'org-client-2' }, { endpoint: ORGS }).catch((e: unknown) => e)
    expect(bad).toMatchObject({ code: 'BAD_USER_INPUT', field: 'handle' })
  })

  test('sends the bearer only when given one, and reads an outage as NETWORK', async () => {
    const probe = 'query OrgClientBearer($id: String) { organization(id: $id) { id } }'
    await orgsRequest(probe, { id: 'org-client-3' }, { endpoint: ORGS, bearer: 'tok-1' })
    await orgsRequest(probe, { id: 'org-client-4' }, { endpoint: ORGS })
    const seen = await stubRequests('OrgClientBearer')
    expect(seen.find((r) => r.variables.id === 'org-client-3')?.headers.authorization).toBe('Bearer tok-1')
    expect(seen.find((r) => r.variables.id === 'org-client-4')?.headers.authorization).toBeUndefined()
    const down = await orgsRequest(probe, {}, { endpoint: 'http://127.0.0.1:9/graphql/renown-orgs' }).catch((e: unknown) => e)
    expect(down).toMatchObject({ code: 'NETWORK' })
    const fromClient = await new GraphQLClient(ORGS).request(probe, { id: 'org-client-1' }).catch((e: unknown) => e)
    expect(toOrgApiError(fromClient).code).toBe('NETWORK')
    expect(toOrgApiError(new OrgApiError('FORBIDDEN', 'x')).code).toBe('FORBIDDEN')
  })
})

test.describe('orgsRequest server-side reads and 401', () => {
  test('server read headers: token only when set, visitor IP from trusted sources only', () => {
    const env = { RENOWN_TRUSTED_READ_TOKEN: 'secret' }
    const ip = (headers: Record<string, string | string[] | undefined>, remoteAddress?: string) =>
      serverReadHeaders({ headers, socket: { remoteAddress } }, {})['X-Renown-Client-IP']
    expect(serverReadHeaders({ headers: { 'x-real-ip': '203.0.113.7' } }, env)).toEqual({
      'X-Renown-Read-Token': 'secret',
      'X-Renown-Client-IP': '203.0.113.7',
    })
    expect(serverReadHeaders({ headers: {} }, env)).toEqual({ 'X-Renown-Read-Token': 'secret' })
    // order: x-vercel-forwarded-for, x-real-ip, last x-forwarded-for hop, socket
    expect(ip({ 'x-vercel-forwarded-for': '203.0.113.1, 10.0.0.1', 'x-real-ip': '203.0.113.2', 'x-forwarded-for': '9.9.9.9, 203.0.113.3' }, '10.0.0.9')).toBe('203.0.113.1')
    expect(ip({ 'x-real-ip': '203.0.113.2', 'x-forwarded-for': '203.0.113.3' }, '10.0.0.9')).toBe('203.0.113.2')
    // a spoofed first hop is ignored: the proxy-appended last hop counts
    expect(ip({ 'x-forwarded-for': '1.2.3.4, 203.0.113.3' }, '10.0.0.9')).toBe('203.0.113.3')
    expect(ip({ 'x-forwarded-for': ['1.2.3.4, 203.0.113.4'] })).toBe('203.0.113.4')
    expect(ip({}, '198.51.100.2')).toBe('198.51.100.2')
    expect(ip({ 'x-forwarded-for': '2001:db8::1' })).toBe('2001:db8::1')
    // not an IP literal: omitted (falls through, else no header)
    expect(ip({ 'x-forwarded-for': 'evil\r\nx: y' })).toBeUndefined()
    expect(ip({ 'x-real-ip': 'not-an-ip', 'x-forwarded-for': '999.1.1.1' })).toBeUndefined()
    expect(serverReadHeaders({ headers: {} }, {})).toEqual({})
  })

  test('the browser path never reads the trusted token', async () => {
    const probe = 'query OrgClientBrowser($id: String) { organization(id: $id) { id } }'
    const before = process.env.RENOWN_TRUSTED_READ_TOKEN
    process.env.RENOWN_TRUSTED_READ_TOKEN = 'must-not-leak'
    ;(globalThis as { window?: unknown }).window = {}
    try {
      await orgsRequest(probe, { id: 'org-client-browser' }, { endpoint: ORGS, request: { headers: { 'x-real-ip': '203.0.113.5' } } })
    } finally {
      delete (globalThis as { window?: unknown }).window
      if (before === undefined) delete process.env.RENOWN_TRUSTED_READ_TOKEN
      else process.env.RENOWN_TRUSTED_READ_TOKEN = before
    }
    const seen = await stubRequests('OrgClientBrowser')
    const sent = seen.find((r) => r.variables.id === 'org-client-browser')
    expect(sent?.headers['x-renown-read-token']).toBeUndefined()
    expect(sent?.headers['x-renown-client-ip']).toBeUndefined()
  })

  test('orgsRequest forwards them from a server request, and a RATE_LIMITED read is distinct', async () => {
    const probe = 'query OrgClientServer($id: String) { organization(id: $id) { id } }'
    await fixtureStub({ id: 'org-client-rl', match: 'OrgClientServer', variables: 'org-client-rl', response: graphqlError('Slow down', 'RATE_LIMITED') })
    const request = { headers: { 'x-real-ip': '203.0.113.9' } }
    const limited = await orgsRequest(probe, { id: 'org-client-rl' }, { endpoint: ORGS, request }).catch((e: unknown) => e)
    expect(isOrgRateLimited(limited)).toBe(true)
    expect(isOrgRateLimited(new OrgApiError('NETWORK', 'x'))).toBe(false)
    const seen = await stubRequests('OrgClientServer')
    expect(seen.find((r) => r.variables.id === 'org-client-rl')?.headers['x-renown-client-ip']).toBe('203.0.113.9')
  })

  test('an invalid or expired bearer (HTTP 401) is FORBIDDEN, not an outage', async () => {
    await fixtureStub({ id: 'org-client-401', match: 'OrgClient401', variables: 'org-client-401', status: 401, response: { error: 'Verification failed' } })
    const probe = 'query OrgClient401($id: String) { organization(id: $id) { id } }'
    const failed = await orgsRequest(probe, { id: 'org-client-401' }, { endpoint: ORGS, bearer: 'stale' }).catch((e: unknown) => e)
    expect(failed).toMatchObject({ code: 'FORBIDDEN', message: 'Sign in again', unauthenticated: true })
  })
})

test.describe('org documents against the served SDL', () => {
  test('every read and mutation document validates', async () => {
    const schema = buildSchema(readFileSync('e2e/fixtures/sdl-renown-orgs.graphql', 'utf8'))
    const sent: string[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      sent.push((JSON.parse(String(init?.body)) as { query: string }).query)
      return new Response(JSON.stringify({ data: {} }), { headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    try {
      const calls = [
        orgs.fetchOrganization({ handle: 'acme' }),
        orgs.searchOrganizations('a'),
        orgs.organizationsByMember('0x1'),
        orgs.organizationMembers('o', true),
        orgs.orgInvites('o', 't'),
        orgs.orgInviteLinks('o', 't'),
        orgs.myOrgInvites('t'),
        orgs.orgInviteLinkPreview('x'),
        orgs.orgHandleAvailability('acme'),
        orgs.myNotifications({ unreadOnly: true, after: null }, 't'),
        orgs.myUnreadNotificationCount('t'),
        orgs.markNotificationsRead({ all: true }, 't'),
        orgs.fetchOrganizationStats('o'),
        orgs.fetchOrganizationDidDocument('o'),
      ]
      await Promise.all(calls)
    } finally {
      globalThis.fetch = realFetch
    }
    expect(sent).toHaveLength(14)
    for (const query of sent) expect(validate(schema, parse(query)).map((e) => e.message), query).toEqual([])
    for (const name of Object.keys(ORG_MUTATIONS) as OrgMutationName[]) {
      expect(validate(schema, parse(mutationDocument(name))).map((e) => e.message), name).toEqual([])
    }
  })
})
