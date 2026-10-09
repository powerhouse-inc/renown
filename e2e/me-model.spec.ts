import { test, expect } from '@playwright/test'
import { verifyMessage } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { profileCompleteness } from '../lib/me/completeness'
import { groupConnections, identityDid, isExpired, profileCandidates, shortDid, type IssuedCredential } from '../lib/me/connections'
import { myDataFileName, myDataJson } from '../lib/me/export'
import { RevokeError, revokeConnection, revokeFailureText, type RevokeAuth } from '../lib/me/revoke'
import type { RenownAppProfile } from '../services/app-profiles'
import { revokeMessage } from '../services/renown-signed-messages'
import { formatAbsolute, formatRelative } from '../utils/relative-time'

// Runs in the Playwright worker (Node): the pure parts of /me.
const NOW = new Date('2026-10-09T12:00:00.000Z')
const ADDRESS = '0x5e1F0a01Aa000000000000000000000000000a01'
const ISSUER = `did:pkh:eip155:1:${ADDRESS.toLowerCase()}`
const ALPHA = 'did:key:z6MkAlphaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
const CLI = 'did:key:z6MkCliSessionxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

function credential(id: string, subject: string | null, issued: string, expires: string | null, extra: Partial<IssuedCredential> = {}): IssuedCredential {
  return {
    documentId: `doc-${id}`,
    credentialId: `urn:uuid:${id}`,
    issuerId: ISSUER,
    issuanceDate: issued,
    expirationDate: expires,
    credentialSubjectId: subject,
    credentialSubjectApp: subject === CLI ? 'ph-cli' : 'renown-app',
    revoked: false,
    ...extra,
  }
}
const alphaProfile = { appDid: ALPHA, documentId: 'alpha-doc', name: 'Alpha', logoRef: null, logo: null } as RenownAppProfile

test.describe('relative time', () => {
  test('formats past and future in plain words', () => {
    expect(formatRelative('2026-10-09T11:59:40.000Z', NOW)).toBe('just now')
    expect(formatRelative('2026-10-09T11:55:00.000Z', NOW)).toBe('5 minutes ago')
    expect(formatRelative('2026-10-09T15:00:00.000Z', NOW)).toBe('in 3 hours')
    expect(formatRelative('2026-10-10T12:00:00.000Z', NOW)).toBe('tomorrow')
    expect(formatRelative('2026-10-15T12:00:00.000Z', NOW)).toBe('in 6 days')
    expect(formatRelative('2026-08-01T12:00:00.000Z', NOW)).toBe('2 months ago')
    expect(formatRelative('2027-10-09T12:00:00.000Z', NOW)).toBe('next year')
    expect(formatRelative('not a date', NOW)).toBe('')
    expect(formatAbsolute('2026-10-09T12:03:00.000Z', 'UTC')).toBe('Oct 9, 2026, 12:03 PM')
  })
})

test.describe('connections', () => {
  test('groups by subject: app profiles under apps, the rest under sessions, newest first', () => {
    const list = [
      credential('a1', ALPHA, '2026-10-01T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
      credential('a2', ALPHA, '2026-10-07T00:00:00.000Z', '2026-10-14T00:00:00.000Z'),
      credential('a2', ALPHA, '2026-10-07T00:00:00.000Z', '2026-10-14T00:00:00.000Z', { documentId: 'doc-a2-copy' }),
      credential('c1', CLI, '2026-10-08T00:00:00.000Z', null),
      credential('old', null, '2026-09-01T00:00:00.000Z', '2026-09-08T00:00:00.000Z'),
      credential('gone', CLI, '2026-10-08T00:00:00.000Z', null, { revoked: true }),
    ]
    const grouped = groupConnections(list, { [ALPHA]: alphaProfile, [CLI]: null })
    expect(grouped.apps.map((g) => [g.name, g.connections.map((c) => c.credentialId)])).toEqual([
      ['Alpha', ['urn:uuid:a2', 'urn:uuid:a1']],
    ])
    expect(grouped.sessions.map((g) => [g.subject, g.name, g.connections.length])).toEqual([
      [CLI, 'ph-cli', 1],
      [ISSUER, 'renown-app', 1],
    ])
    const hidden = groupConnections(list, { [ALPHA]: alphaProfile }, new Set(['urn:uuid:a2']))
    expect(hidden.apps[0].connections.map((c) => c.credentialId)).toEqual(['urn:uuid:a1'])
  })

  test('helpers', () => {
    expect(profileCandidates([credential('a', ALPHA, NOW.toISOString(), null), credential('b', ALPHA, NOW.toISOString(), null), credential('c', null, NOW.toISOString(), null)])).toEqual([ALPHA])
    expect(isExpired('2026-10-09T12:00:00.000Z', NOW)).toBe(true)
    expect(isExpired('2026-10-09T12:00:01.000Z', NOW)).toBe(false)
    expect(isExpired(null, NOW)).toBe(false)
    expect(shortDid(ALPHA)).toBe('did:key:z6MkAlph…xxxx')
    expect(identityDid(ADDRESS, [])).toBe(ISSUER)
    expect(identityDid(ADDRESS, [credential('x', null, NOW.toISOString(), null, { issuerId: `did:pkh:eip155:137:${ADDRESS.toLowerCase()}` })])).toBe(
      `did:pkh:eip155:137:${ADDRESS.toLowerCase()}`,
    )
  })

  test('completeness counts avatar, handle, bio and a link', () => {
    expect(profileCompleteness(null)).toMatchObject({ done: 0, total: 4, percent: 0 })
    const half = profileCompleteness({ documentId: 'd', handle: 'frank', userImage: 'https://x.example/a.png', bio: '  ', links: [] })
    expect(half.items.map((i) => [i.key, i.done])).toEqual([
      ['avatar', true],
      ['handle', true],
      ['bio', false],
      ['links', false],
    ])
    expect(half.percent).toBe(50)
  })

  test('the export holds the profile fields and the approvals as shown', () => {
    const grouped = groupConnections([credential('a1', ALPHA, '2026-10-01T00:00:00.000Z', '2026-10-08T00:00:00.000Z')], { [ALPHA]: alphaProfile })
    const json = JSON.parse(
      myDataJson({ address: ADDRESS, did: ISSUER, profile: { documentId: 'p', handle: 'frank', links: [{ id: 'l', label: 'Site', url: 'https://f.example' }] }, connections: grouped, now: NOW }),
    ) as Record<string, unknown>
    expect(json).toMatchObject({
      exportedAt: NOW.toISOString(),
      address: ADDRESS.toLowerCase(),
      did: ISSUER,
      profile: { documentId: 'p', handle: 'frank', displayName: null, links: [{ label: 'Site', url: 'https://f.example' }] },
      approvals: [{ subject: ALPHA, kind: 'app', name: 'Alpha', credentials: [{ credentialId: 'urn:uuid:a1', expired: true }] }],
    })
    expect(myDataFileName(ADDRESS)).toBe(`renown-${ADDRESS.toLowerCase()}.json`)
  })
})

test.describe('revoke', () => {
  // The exact message renown-package subgraphs/renown-auth/core/signed-message.ts verifies.
  test('revokeMessage matches the server format (test vector)', async () => {
    const message = revokeMessage('urn:uuid:1b4e28ba-2d11-4d4d-9f3b-8f1d5c6a7e90', '2026-10-09T12:00:00.000Z')
    expect(message).toBe('Revoke Renown credential urn:uuid:1b4e28ba-2d11-4d4d-9f3b-8f1d5c6a7e90 at 2026-10-09T12:00:00.000Z')
    const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)
    expect(account.address).toBe('0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A')
    const signature = await account.signMessage({ message })
    expect(signature).toBe(
      '0xf209d469daeee91c19b378a4365180000fa9caa38dcc210f75520a235532c4212e6b3c2dfcc297632d4ad86f4b710888faca93cc26590ae892dbb93fd05420381b',
    )
    expect(await verifyMessage({ address: account.address, message, signature })).toBe(true)
  })

  function recorder(answers: (RevokeError | null)[]) {
    const sent: RevokeAuth[] = []
    return {
      sent,
      send: async (_id: string, auth: RevokeAuth) => {
        sent.push(auth)
        const answer = answers.shift()
        if (answer) throw answer
      },
    }
  }
  const sign = async (message: string) => `signed:${message}`

  test('uses the bearer when it works, and signs nothing', async () => {
    const r = recorder([null])
    expect(await revokeConnection('urn:uuid:x', { getBearer: async () => 'jwt', signMessage: sign, send: r.send })).toBe('bearer')
    expect(r.sent).toEqual([{ bearer: 'jwt' }])
  })

  test('falls back to a signature without a bearer or when the bearer is refused', async () => {
    for (const getBearer of [async () => null, async () => Promise.reject(new Error('no session')) as Promise<string | null>]) {
      const r = recorder([null])
      expect(await revokeConnection('urn:uuid:x', { getBearer, signMessage: sign, send: r.send, now: () => NOW })).toBe('signature')
      expect(r.sent).toEqual([{ signature: `signed:Revoke Renown credential urn:uuid:x at ${NOW.toISOString()}`, timestamp: NOW.toISOString() }])
    }
    const refused = recorder([new RevokeError('FORBIDDEN'), null])
    expect(await revokeConnection('urn:uuid:x', { getBearer: async () => 'jwt', signMessage: sign, send: refused.send, now: () => NOW })).toBe('signature')
    expect(refused.sent).toHaveLength(2)
  })

  test('does not retry other failures, and reports a missing wallet or a declined signature', async () => {
    const notFound = recorder([new RevokeError('NOT_FOUND')])
    await expect(revokeConnection('x', { getBearer: async () => 'jwt', signMessage: sign, send: notFound.send })).rejects.toMatchObject({ reason: 'NOT_FOUND' })
    expect(notFound.sent).toHaveLength(1)
    await expect(revokeConnection('x', { getBearer: async () => null, signMessage: null, send: recorder([]).send })).rejects.toMatchObject({ reason: 'NO_WALLET' })
    const declined = recorder([])
    await expect(
      revokeConnection('x', { getBearer: async () => null, signMessage: () => Promise.reject(new Error('4001')), send: declined.send }),
    ).rejects.toMatchObject({ reason: 'DECLINED' })
    expect(declined.sent).toEqual([])
    expect(revokeFailureText('FORBIDDEN')).toMatch(/wallet that gave it/)
  })
})
