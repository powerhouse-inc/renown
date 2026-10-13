import { test, expect } from '@playwright/test'
import { verifyMessage } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { orgMessage } from '../services/org-signed-messages'
import { signedOrgWrite, type OrgSigner } from '../services/org-client-write'
import { fixtureStub, graphqlError, stubRequests } from './support/stub-switchboard-client'
import { OrgApiError, withBearer } from '../services/orgs'
import { orgInvite } from './support/org-fixtures'

// The write path: the API route against the stub switchboard (request
// fixture), and the browser writer in the Playwright worker with a real key.
const account = privateKeyToAccount(generatePrivateKey())
const signer: OrgSigner = {
  address: account.address,
  signMessage: (message) => account.signMessage({ message }),
}
const AUTH = {
  address: account.address,
  signature: '0x1234',
  timestamp: '2026-10-12T12:00:00.000Z',
}

test.describe('/api/org/[mutation]', () => {
  test('refuses other methods, unknown mutations, bad arguments and a missing signature', async ({
    request,
  }) => {
    expect((await request.get('/api/org/inviteOrgMember')).status()).toBe(405)
    const unknown = await request.post('/api/org/resolveOrgReport', {
      data: { args: {}, auth: AUTH },
    })
    expect(unknown.status()).toBe(404)
    expect(await unknown.json()).toMatchObject({ code: 'NOT_FOUND' })
    const noAuth = await request.post('/api/org/inviteOrgMember', {
      data: { args: { orgId: 'o', invitee: 'bob', role: 'MEMBER' } },
    })
    expect(noAuth.status()).toBe(401)
    expect(await noAuth.json()).toMatchObject({ code: 'FORBIDDEN', field: 'auth' })
    const badAuth = await request.post('/api/org/inviteOrgMember', {
      data: {
        args: { orgId: 'o', invitee: 'bob', role: 'MEMBER' },
        auth: { ...AUTH, address: 'alice' },
      },
    })
    expect(badAuth.status()).toBe(401)
    const smuggled = await request.post('/api/org/inviteOrgMember', {
      data: { args: { orgId: 'o', invitee: 'bob', role: 'MEMBER', auth: AUTH }, auth: AUTH },
    })
    expect(smuggled.status()).toBe(400)
    expect(await smuggled.json()).toMatchObject({ code: 'BAD_USER_INPUT', field: 'auth' })
    const missing = await request.post('/api/org/inviteOrgMember', {
      data: { args: { orgId: 'o', invitee: 'bob' }, auth: AUTH },
    })
    expect(await missing.json()).toMatchObject({ code: 'BAD_USER_INPUT', field: 'role' })
    const notObject = await request.post('/api/org/inviteOrgMember', {
      data: { args: 'x', auth: AUTH },
    })
    expect(await notObject.json()).toMatchObject({ code: 'BAD_USER_INPUT', field: 'args' })
  })

  test('forwards the arguments and the signature unchanged and returns the result', async ({
    request,
  }) => {
    const invite = orgInvite({
      address: '0xb0b0000000000000000000000000000000000002',
      orgId: 'org-write-1',
    })
    await fixtureStub({
      match: 'mutation InviteOrgMember',
      variables: 'org-write-1',
      response: { data: { inviteOrgMember: invite } },
    })
    const args = { orgId: 'org-write-1', invitee: 'bob', role: 'PUBLISHER' }
    const res = await request.post('/api/org/inviteOrgMember', { data: { args, auth: AUTH } })
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ data: invite })
    const [sent] = (await stubRequests('mutation InviteOrgMember')).filter(
      (r) => r.variables.orgId === 'org-write-1',
    )
    expect(sent.variables).toEqual({ ...args, auth: AUTH })
    expect(sent.headers.authorization).toBeUndefined()
  })

  test('relays refusals with their code, field and status', async ({ request }) => {
    await fixtureStub({
      match: 'mutation LeaveOrganization',
      variables: 'org-write-2',
      response: graphqlError('Only owner', 'LAST_OWNER'),
    })
    await fixtureStub({
      match: 'mutation InviteOrgMember',
      variables: 'org-write-3',
      response: graphqlError('No Renown user has the handle nobody', 'BAD_USER_INPUT', {
        field: 'invitee',
      }),
    })
    const last = await request.post('/api/org/leaveOrganization', {
      data: { args: { orgId: 'org-write-2' }, auth: AUTH },
    })
    expect(last.status()).toBe(409)
    expect(await last.json()).toMatchObject({ code: 'LAST_OWNER' })
    const bad = await request.post('/api/org/inviteOrgMember', {
      data: { args: { orgId: 'org-write-3', invitee: 'nobody', role: 'MEMBER' }, auth: AUTH },
    })
    expect(bad.status()).toBe(400)
    expect(await bad.json()).toMatchObject({
      code: 'BAD_USER_INPUT',
      field: 'invitee',
      error: 'No Renown user has the handle nobody',
    })
  })
})

test.describe('signedOrgWrite', () => {
  const now = new Date('2026-10-12T12:00:00.000Z')

  test('signs exactly the arguments it posts (undefined dropped, null kept)', async () => {
    const posts: {
      url: string
      body: {
        args: Record<string, unknown>
        auth: { address: string; signature: `0x${string}`; timestamp: string }
      }
    }[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      posts.push({ url, body: JSON.parse(String(init.body)) })
      return new Response(JSON.stringify({ data: { id: 'org-1' } }), { status: 200 })
    }) as unknown as typeof fetch
    const result = await signedOrgWrite(
      'updateOrganization',
      { orgId: 'org-1', name: 'Acme', bio: undefined, website: null },
      signer,
      { now, fetchImpl },
    )
    expect(result).toEqual({ ok: true, data: { id: 'org-1' } })
    const [posted] = posts
    expect(posted.url).toBe('/api/org/updateOrganization')
    expect(posted.body.args).toEqual({ orgId: 'org-1', name: 'Acme', website: null })
    expect(posted.body.auth.timestamp).toBe(now.toISOString())
    const message = await orgMessage(
      'updateOrganization',
      'org-1',
      posted.body.args,
      now.toISOString(),
    )
    expect(
      await verifyMessage({
        address: account.address,
        message,
        signature: posted.body.auth.signature,
      }),
    ).toBe(true)
  })

  test('reports a declined signature, a missing wallet, no answer and a refusal', async () => {
    const declined = await signedOrgWrite(
      'leaveOrganization',
      { orgId: 'o' },
      { address: account.address, signMessage: () => Promise.reject(new Error('4001')) },
      { now },
    )
    expect(declined).toMatchObject({
      ok: false,
      code: 'DECLINED',
      message: 'Signature declined. Nothing was changed.',
    })
    expect(await signedOrgWrite('leaveOrganization', { orgId: 'o' }, null, { now })).toMatchObject({
      ok: false,
      code: 'NO_WALLET',
    })
    const offline = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    expect(
      await signedOrgWrite('leaveOrganization', { orgId: 'o' }, signer, {
        now,
        fetchImpl: offline,
      }),
    ).toMatchObject({ ok: false, code: 'NETWORK', unconfirmed: true })
    const refused = (async () =>
      new Response(JSON.stringify({ error: 'x', code: 'LAST_OWNER' }), {
        status: 409,
      })) as unknown as typeof fetch
    expect(
      await signedOrgWrite('leaveOrganization', { orgId: 'o' }, signer, {
        now,
        fetchImpl: refused,
      }),
    ).toEqual({
      ok: false,
      code: 'LAST_OWNER',
      field: null,
      message: 'An organisation always needs an owner. Add another owner first.',
    })
  })

  test('marks unknown codes and unparsable answers as unconfirmed', async () => {
    const unknownCode = (async () =>
      new Response(JSON.stringify({ error: 'x', code: 'WAT' }), {
        status: 500,
      })) as unknown as typeof fetch
    expect(
      await signedOrgWrite('leaveOrganization', { orgId: 'o' }, signer, {
        now,
        fetchImpl: unknownCode,
      }),
    ).toMatchObject({ ok: false, code: 'NETWORK', unconfirmed: true })
    const garbage = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch
    expect(
      await signedOrgWrite('leaveOrganization', { orgId: 'o' }, signer, {
        now,
        fetchImpl: garbage,
      }),
    ).toMatchObject({ ok: false, code: 'NETWORK', unconfirmed: true })
  })

  test('goes through the real route to the switchboard', async ({ baseURL }) => {
    const invite = orgInvite({
      address: '0xb0b0000000000000000000000000000000000002',
      orgId: 'org-write-4',
    })
    await fixtureStub({
      match: 'mutation InviteOrgMember',
      variables: 'org-write-4',
      response: { data: { inviteOrgMember: invite } },
    })
    const result = await signedOrgWrite(
      'inviteOrgMember',
      { orgId: 'org-write-4', invitee: 'bob', role: 'MEMBER' },
      signer,
      { base: baseURL },
    )
    expect(result).toEqual({ ok: true, data: invite })
  })
})

test.describe('withBearer', () => {
  const unauthenticated = () => new OrgApiError('FORBIDDEN', 'Sign in again', null, true)

  test('retries once with a fresh bearer after a 401', async () => {
    const asked: unknown[] = []
    const getBearer = async (o?: { fresh?: boolean }) => (asked.push(o), o?.fresh ? 'new' : 'old')
    const used: (string | null)[] = []
    const value = await withBearer(getBearer, async (b) => {
      used.push(b)
      if (b === 'old') throw unauthenticated()
      return 'ok'
    })
    expect(value).toBe('ok')
    expect(used).toEqual(['old', 'new'])
    expect(asked).toEqual([undefined, { fresh: true }])
  })

  test('does not retry a plain FORBIDDEN or other errors', async () => {
    let calls = 0
    const forbidden = withBearer(
      async () => 'b',
      async () => (calls++, Promise.reject(new OrgApiError('FORBIDDEN', 'no'))),
    )
    await expect(forbidden).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(calls).toBe(1)
  })

  test('retries at most once', async () => {
    let calls = 0
    const stuck = withBearer(
      async () => 'b',
      async () => (calls++, Promise.reject(unauthenticated())),
    )
    await expect(stuck).rejects.toMatchObject({ unauthenticated: true })
    expect(calls).toBe(2)
  })
})
