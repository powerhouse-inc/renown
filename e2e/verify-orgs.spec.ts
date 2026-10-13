import { test, expect } from '@playwright/test'
import { verifyAuthBearerToken, verifyCredentialSignature } from '@renown/sdk'
import { hashTypedData } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { RELEASE_DOMAIN, RELEASE_TYPES, verifyAttestation } from '../lib/verify/attestation'
import { verifyCredential } from '../lib/verify/credential'
import { detectInput } from '../lib/verify/detect'
import { verifyToken } from '../lib/verify/token'
import type {
  OrgCredentialVerdict,
  OrgLookups,
  PartyProfile,
  Report,
  StoredAttestation,
  StoredCredential,
  VerifyDeps,
  VerifyLookups,
} from '../lib/verify/types'
import { makeAppKey, makeBearerToken, makeCredential, makeWallet } from './support/verify-fixtures'

// Runs in the Playwright worker (Node): real EIP-712 signatures with fresh keys,
// switchboard and organisation reads replaced by an in-memory world.
const APP = 'did:key:z6MkAcmeFixtureAppAxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
const ORG = { id: 'org-verify-1', did: 'did:web:www.renown.id:org:org-verify-1', handle: 'acme', name: 'Acme', verifiedDomains: ['acme.example'] }
const NOW = new Date('2026-10-13T09:00:00.000Z')

interface World {
  profiles?: Record<string, PartyProfile>
  attestations?: StoredAttestation[]
  /** releaseAttestation(id); defaults to a lookup in `attestations`. */
  byId?: Record<string, StoredAttestation | null>
  status?: OrgCredentialVerdict | null
  orgDown?: boolean
  /** Only the publishing-organisation read fails. */
  publisherDown?: boolean
  /** No organisation publishes the app (a person-published app). */
  personalApp?: boolean
  credentials?: StoredCredential[]
  /** Organisation ids asked for (releaseAttestation / releaseAttestations calls). */
  calls?: string[]
}

function deps(world: World): VerifyDeps {
  const lookups: VerifyLookups = {
    credentialById: async () => ({ ok: true, value: [] }),
    credentialsFor: async () => ({ ok: true, value: world.credentials ?? [] }),
    profileByAddress: async (address) => ({ ok: true, value: world.profiles?.[address.toLowerCase()] ?? null }),
    appProfile: async () => ({ ok: true, value: { documentId: 'doc-app', name: 'Acme Ledger', logoRef: null } }),
  }
  const orgs: OrgLookups = {
    credentialStatus: async () => {
      world.calls?.push('rules')
      return world.orgDown ? { ok: false } : { ok: true, value: world.status ?? null }
    },
    appPublisherOrg: async () => (world.publisherDown ? { ok: false } : { ok: true, value: world.personalApp ? null : ORG }),
    releaseAttestation: async (id) => {
      world.calls?.push(`id:${id}`)
      if (world.orgDown) return { ok: false }
      if (world.byId && id in world.byId) return { ok: true, value: world.byId[id] }
      return { ok: true, value: world.attestations?.find((a) => a.id === id) ?? null }
    },
    releaseAttestations: async () => {
      world.calls?.push('page')
      return world.orgDown ? { ok: false } : { ok: true, value: world.attestations ?? [] }
    },
  }
  return {
    lookups,
    orgs,
    eoaSignature: (credential) => verifyCredentialSignature(credential as never),
    async bearerToken(jwt, audience) {
      const original = console.error
      console.error = () => undefined
      try {
        return (await verifyAuthBearerToken(jwt, audience ? { audience } : undefined)) !== false
      } finally {
        console.error = original
      }
    },
    contractSignature: async () => 'not-contract',
    now: NOW,
  }
}

async function signedAttestation(over: Record<string, string> = {}, message: Record<string, string> = {}) {
  const account = privateKeyToAccount(generatePrivateKey())
  const signed = { appDid: APP, version: '1.4.0', artifactDigest: `sha256:${'b'.repeat(64)}`, orgId: ORG.id, issuedAt: '2026-10-12T10:00:00.000Z', ...message }
  const signature = await account.signTypedData({ domain: RELEASE_DOMAIN, types: RELEASE_TYPES, primaryType: 'ReleaseAttestation', message: signed })
  return { account, json: { ...signed, signer: account.address, signature, ...over } }
}

function stored(json: { signature: string; signer: string }, extra: Partial<StoredAttestation> = {}): StoredAttestation {
  return {
    id: 'att-1',
    appDid: APP,
    version: '1.4.0',
    artifactDigest: `sha256:${'b'.repeat(64)}`,
    orgId: ORG.id,
    signer: json.signer.toLowerCase(),
    signerRole: 'PUBLISHER',
    signerStillMember: true,
    issuedAt: '2026-10-12T10:00:00.000Z',
    signature: json.signature,
    createdAt: '2026-10-12T10:01:00.000Z',
    ...extra,
  }
}

const status = (report: Report) => Object.fromEntries(report.checks.map((c) => [c.id, c.status]))
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`.toLowerCase()

test.describe('release attestations', () => {
  test('sign with the SDK constants (pinned digest of the sdk test vector)', () => {
    const digest = hashTypedData({
      domain: RELEASE_DOMAIN,
      types: RELEASE_TYPES,
      primaryType: 'ReleaseAttestation',
      message: {
        appDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        version: '1.4.0',
        artifactDigest: `sha256:${'ab'.repeat(32)}`,
        orgId: '',
        issuedAt: '2026-10-12T12:00:00.000Z',
      },
    })
    expect(digest).toBe('0x43728eb03c4cceb9ea1f9150324df1eef8628987665e83977e7cfe4d0588ebc4')
  })

  test('are detected from their JSON', async () => {
    const { json } = await signedAttestation()
    expect(detectInput(JSON.stringify({ id: 'att-1', ...json })).kind).toBe('release-attestation')
  })

  test('a recorded sign-off for the publishing organisation is genuine', async () => {
    const { account, json } = await signedAttestation()
    const world = { profiles: { [account.address.toLowerCase()]: { documentId: 'd', handle: 'alice', displayName: 'Alice', username: null, avatar: null } }, attestations: [stored(json)] }
    const report = await verifyAttestation(json, deps(world))
    expect(report.verdict).toBe('genuine')
    expect(status(report)).toEqual({ signature: 'pass', record: 'pass', 'issued-at': 'pass', publisher: 'pass' })
    expect(report.summary).toBe('Release 1.4.0 of Acme Ledger — published by Acme, signed off by Alice.')
    expect(report.app?.publisherOrg).toMatchObject({ handle: 'acme' })
  })

  test('a changed attestation is not genuine; an unrecorded one says so; an outage cannot be checked', async () => {
    const { json } = await signedAttestation()
    const changed = await verifyAttestation({ ...json, version: '1.4.1' }, deps({}))
    expect(changed.verdict).toBe('not-genuine')
    expect(status(changed)).toEqual({ signature: 'fail', record: 'neutral', 'issued-at': 'neutral', publisher: 'neutral' })
    // A valid signature without Renown's record says nothing about who may release the app (I6).
    const unrecorded = await verifyAttestation(json, deps({}))
    expect(unrecorded.verdict).toBe('unrecorded')
    expect(unrecorded.summary).toBe(`${short(json.signer)} signed release 1.4.0 of Acme Ledger, but Renown has no record of it, so it says nothing about who may release Acme Ledger.`)
    expect((await verifyAttestation(json, deps({ orgDown: true }))).verdict).toBe('unchecked')
    const broken = await verifyAttestation({ ...json, artifactDigest: 'sha256:xyz' }, deps({}))
    expect(broken).toMatchObject({ verdict: 'not-genuine', summary: 'This is not a complete release attestation: artifactDigest is missing or malformed.' })
  })

  test('a pasted id is cross-checked with releaseAttestation(id) before the 50-item page (D16)', async () => {
    const { json } = await signedAttestation()
    const calls: string[] = []
    const byId = await verifyAttestation({ id: 'att-1', ...json }, deps({ attestations: [stored(json)], calls }))
    expect(status(byId).record).toBe('pass')
    expect(calls).toEqual(['id:att-1'])

    // The id names a different attestation: fall back to the page, and say so.
    const other = await signedAttestation()
    const fallback: string[] = []
    const mismatched = await verifyAttestation(
      { id: 'att-9', ...json },
      deps({ attestations: [stored(json)], byId: { 'att-9': stored(other.json, { id: 'att-9' }) }, calls: fallback }),
    )
    expect(fallback).toEqual(['id:att-9', 'page'])
    expect(status(mismatched).record).toBe('pass')
    expect(mismatched.checks.find((c) => c.id === 'record')?.detail).toMatch(/belongs to a different attestation\.$/)

    // Without an id, only the page is asked.
    const pageOnly: string[] = []
    await verifyAttestation(json, deps({ attestations: [stored(json)], calls: pageOnly }))
    expect(pageOnly).toEqual(['page'])
  })

  test('a stored record counts only when every signed field matches (same signature, other version)', async () => {
    const { json } = await signedAttestation()
    const other = stored(json, { version: '1.5.0' })
    const report = await verifyAttestation({ id: 'att-1', ...json }, deps({ attestations: [other] }))
    expect(report.verdict).toBe('unrecorded')
    expect(status(report).record).toBe('neutral')
    expect(report.summary).toMatch(/Renown has no record of it, so it says nothing about who may release Acme Ledger\.$/)
    expect(report.times.map((t) => t.label)).toEqual(['Signed off'])
  })

  test('an issuedAt without a zone is not a complete attestation', async () => {
    const { json } = await signedAttestation({}, { issuedAt: '2026-10-12T10:00:00' })
    const report = await verifyAttestation(json, deps({}))
    expect(report).toMatchObject({ verdict: 'not-genuine', summary: 'This is not a complete release attestation: issuedAt is missing or malformed.' })
  })

  test('when only the publisher read fails, the summary says so', async () => {
    const { json } = await signedAttestation()
    const report = await verifyAttestation(json, deps({ attestations: [stored(json)], publisherDown: true }))
    expect(report.verdict).toBe('unchecked')
    expect(status(report)).toMatchObject({ record: 'pass', publisher: 'unknown' })
    expect(report.summary).toMatch(/could not be reached to check which organisation publishes the app\. Try again in a moment\.$/)
  })

  test('issuedAt is checked as signed against Renown’s window (D17)', async () => {
    // Recorded: judged at the time Renown recorded it, so an old release stays fine.
    const { json } = await signedAttestation()
    const recordedLate = await verifyAttestation(json, deps({ attestations: [stored(json, { createdAt: '2026-12-01T00:00:00.000Z' })] }))
    expect(recordedLate.verdict).toBe('genuine')
    expect(status(recordedLate)['issued-at']).toBe('neutral')

    // Unrecorded and too old to be recorded now: informative, not a verdict change.
    const old = await signedAttestation({}, { issuedAt: '2026-08-01T10:00:00.000Z' })
    const stale = await verifyAttestation(old.json, deps({}))
    expect(stale.verdict).toBe('unrecorded')
    expect(status(stale)['issued-at']).toBe('neutral')

    // An offset zone is kept verbatim: the signature only holds over the exact string.
    const zoned = await signedAttestation({}, { issuedAt: '2026-10-12T12:00:00+02:00' })
    const verbatim = await verifyAttestation(zoned.json, deps({}))
    expect(status(verbatim)).toMatchObject({ signature: 'pass', 'issued-at': 'pass' })
    expect(verbatim.times[0]).toEqual({ label: 'Signed off', iso: '2026-10-12T12:00:00+02:00' })
  })
})

test.describe('organisation rules on credentials', () => {
  test('a credential whose issuer left the organisation no longer counts', async () => {
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: APP, issuedAt: new Date(NOW.getTime() - 60_000) })
    const report = await verifyCredential(credential, deps({ status: { appDid: APP, orgId: ORG.id, counts: false, reason: 'ISSUER_NOT_MEMBER' } }))
    expect(report.verdict).toBe('revoked')
    expect(status(report)['org-rules']).toBe('fail')
    expect(report.summary).toBe(`${short(wallet.address)} is no longer a member of Acme, so this delegation no longer counts.`)
  })

  test('counts when the rules allow it, and cannot be checked when they cannot be read', async () => {
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: APP, issuedAt: new Date(NOW.getTime() - 60_000) })
    const allowed = await verifyCredential(credential, deps({ status: { appDid: APP, orgId: ORG.id, counts: true, reason: null } }))
    expect(allowed.verdict).toBe('genuine')
    expect(status(allowed)['org-rules']).toBe('pass')
    const personal = await verifyCredential(credential, deps({ status: null }))
    expect(status(personal)['org-rules']).toBeUndefined()
    expect((await verifyCredential(credential, deps({ orgDown: true }))).verdict).toBe('unchecked')
  })

  test('a person-published app never asks for organisation rules, so a renown-orgs outage cannot degrade it', async () => {
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: APP, issuedAt: new Date(NOW.getTime() - 60_000) })
    const calls: string[] = []
    const report = await verifyCredential(credential, deps({ personalApp: true, orgDown: true, calls }))
    expect(report.verdict).toBe('genuine')
    expect(status(report)['org-rules']).toBeUndefined()
    expect(calls).toEqual([])
    // The publisher read itself failed: the rules are still asked (an organisation may publish it).
    const unknownPublisher: string[] = []
    await verifyCredential(credential, deps({ publisherDown: true, status: null, calls: unknownPublisher }))
    expect(unknownPublisher).toEqual(['rules'])

    const key = await makeAppKey()
    const tokenCredential = (await makeCredential({ wallet, subject: key.did, app: 'Vault' })) as { id: string; issuanceDate: string; expirationDate: string }
    const row: StoredCredential = {
      credentialId: tokenCredential.id,
      issuerEthereumAddress: wallet.address,
      credentialSubjectId: key.did,
      credentialSubjectApp: 'Vault',
      issuanceDate: tokenCredential.issuanceDate,
      expirationDate: tokenCredential.expirationDate,
      revoked: false,
      revokedAt: null,
      revocationReason: null,
    }
    const token = await makeBearerToken(key, wallet.address)
    const tokenCalls: string[] = []
    const tokenReport = await verifyToken(token, { ...deps({ credentials: [row], personalApp: true, orgDown: true, calls: tokenCalls }), now: new Date() })
    expect(tokenReport.verdict).toBe('genuine')
    expect(tokenCalls).toEqual([])
  })

  test('every rules reason turns a genuine bearer token into "revoked"', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const credential = (await makeCredential({ wallet, subject: key.did, app: 'Vault' })) as { id: string; issuanceDate: string; expirationDate: string }
    const row: StoredCredential = {
      credentialId: credential.id,
      issuerEthereumAddress: wallet.address,
      credentialSubjectId: key.did,
      credentialSubjectApp: 'Vault',
      issuanceDate: credential.issuanceDate,
      expirationDate: credential.expirationDate,
      revoked: false,
      revokedAt: null,
      revocationReason: null,
    }
    const token = await makeBearerToken(key, wallet.address)
    const world = (reason: OrgCredentialVerdict['reason']): World => ({
      credentials: [row],
      status: { appDid: key.did, orgId: ORG.id, counts: false, reason },
    })
    const expected: Record<string, string> = {
      ISSUER_NOT_MEMBER: `${short(wallet.address)} is no longer a member of Acme, so this delegation no longer counts.`,
      ISSUER_NOT_PUBLISHER: `${short(wallet.address)} may no longer publish this app for Acme, so this delegation no longer counts.`,
      SUSPENDED: 'Acme suspended this delegation, so this delegation no longer counts.',
      APP_FROZEN: 'Acme froze this app, so this delegation no longer counts.',
    }
    for (const [reason, summary] of Object.entries(expected)) {
      const report = await verifyToken(token, { ...deps(world(reason as OrgCredentialVerdict['reason'])), now: new Date() })
      expect(report.verdict).toBe('revoked')
      expect(report.summary).toBe(summary)
      expect(status(report)['org-rules']).toBe('fail')
    }
  })
})
