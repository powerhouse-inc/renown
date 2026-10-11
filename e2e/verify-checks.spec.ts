import { test, expect } from '@playwright/test'
import { verifyAuthBearerToken, verifyCredentialSignature } from '@renown/sdk'
import { verifyCredential, verifyCredentialId } from '../lib/verify/credential'
import { verifyAppDid, verifyWalletDid } from '../lib/verify/did'
import { verifyOperation } from '../lib/verify/operation'
import { signerHeading } from '../lib/verify/parties'
import { checkContractSignature, rpcUrl, type ChainReader } from '../lib/verify/smart-wallet'
import { verifyToken } from '../lib/verify/token'
import { liveDeps } from '../lib/verify/run'
import type {
  ContractSignature,
  PartyProfile,
  Report,
  StoredCredential,
  StoredCredentialFull,
  VerifyDeps,
  VerifyLookups,
} from '../lib/verify/types'
import { SKIPPED_DETAIL } from '../lib/verify/types'
import {
  makeAppKey,
  makeBearerToken,
  makeCredential,
  makeLegacyAction,
  makeV2Action,
  makeWallet,
  type AppKey,
} from './support/verify-fixtures'

// Runs in the Playwright worker (Node): every /verify check against real
// signatures made with fresh keys (e2e/support/verify-fixtures.ts), with the
// switchboard lookups replaced by an in-memory registry.

const DAY = 86_400_000

interface Registry {
  credentials: StoredCredentialFull[]
  profiles: Record<string, PartyProfile>
  down?: boolean
}

function stored(credential: Record<string, unknown>, extra: Partial<StoredCredential> = {}): StoredCredentialFull {
  const c = credential as {
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
    // The read model keeps the address as signed (checksummed), not lowercased.
    issuerEthereumAddress: c.issuer.ethereumAddress,
    credentialSubjectId: c.credentialSubject.id,
    issuanceDate: c.issuanceDate,
    expirationDate: c.expirationDate,
    revoked: false,
    revokedAt: null,
    revocationReason: null,
    context: c['@context'],
    type: c.type,
    issuerId: c.issuer.id,
    credentialSubjectApp: c.credentialSubject.app,
    credentialSchemaId: c.credentialSchema.id,
    credentialSchemaType: c.credentialSchema.type,
    proofValue: c.proof.proofValue,
    proofEthereumAddress: c.proof.ethereumAddress,
    proofEip712Domain: JSON.stringify(c.proof.eip712.domain),
    ...extra,
  }
}

function lookups(registry: Registry): VerifyLookups {
  const down = { ok: false as const }
  return {
    async credentialById(id) {
      return registry.down ? down : { ok: true, value: registry.credentials.filter((c) => c.credentialId === id) }
    },
    async credentialsFor(did, address) {
      if (registry.down) return down
      return {
        ok: true,
        value: registry.credentials.filter((c) => c.credentialSubjectId === did && c.issuerEthereumAddress.toLowerCase() === address.toLowerCase()),
      }
    },
    async profileByAddress(address) {
      return registry.down ? down : { ok: true, value: registry.profiles[address.toLowerCase()] ?? null }
    },
    async appProfile() {
      return registry.down ? down : { ok: true, value: null }
    },
  }
}

function deps(registry: Registry, overrides: Partial<VerifyDeps> = {}): VerifyDeps {
  return {
    lookups: lookups(registry),
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
    now: new Date(),
    ...overrides,
  }
}

const status = (report: Report) => Object.fromEntries(report.checks.map((c) => [c.id, c.status]))

test.describe('/verify credentials', () => {
  test('a stored, in-date credential is genuine', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: key.did, app: 'Vault' })
    const registry = { credentials: [stored(credential)], profiles: { [wallet.address.toLowerCase()]: { documentId: 'doc-ann', handle: 'ann', displayName: 'Ann', username: null, avatar: null } } }
    const report = await verifyCredential(credential, deps(registry))
    expect(report.verdict).toBe('genuine')
    expect(status(report)).toEqual({ signature: 'pass', validity: 'pass', revocation: 'pass', subject: 'neutral' })
    expect(report.summary).toBe('Ann signed this credential for Vault. It is in date and has not been revoked.')
    expect(report.signer).toMatchObject({ address: wallet.address.toLowerCase(), profile: { handle: 'ann' } })
    expect(report.app).toMatchObject({ did: key.did, claimedName: 'Vault', session: false })
  })

  test('a changed credential is not genuine', async () => {
    const key = await makeAppKey()
    const credential = await makeCredential({ wallet: makeWallet(), subject: key.did })
    const tampered = { ...credential, expirationDate: new Date(Date.now() + 999 * DAY).toISOString() }
    // Registered and in date, but forged: nothing past the signature is vouched for.
    const report = await verifyCredential(tampered, deps({ credentials: [stored(credential)], profiles: {} }))
    expect(report.verdict).toBe('not-genuine')
    expect(status(report)).toMatchObject({ signature: 'fail', validity: 'neutral', revocation: 'neutral' })
    expect(report.checks.find((c) => c.id === 'revocation')?.detail).toMatch(/^Not checked/)
  })

  test('a credential whose issuer DID names another wallet is not genuine', async () => {
    const key = await makeAppKey()
    const credential = await makeCredential({ wallet: makeWallet(), subject: key.did })
    const other = makeWallet().address
    const report = await verifyCredential({ ...credential, issuer: { id: `did:pkh:eip155:1:${other.toLowerCase()}`, ethereumAddress: (credential.issuer as { ethereumAddress: string }).ethereumAddress } }, deps({ credentials: [], profiles: {} }))
    expect(report.verdict).toBe('not-genuine')
    expect(report.checks[0].detail).toBe('The issuer DID and the issuer address name different wallets.')
  })

  test('revoked and expired credentials say so, revoked first', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const revokedAt = new Date(Date.now() - DAY).toISOString()
    const live = await makeCredential({ wallet, subject: key.did })
    const revoked = await verifyCredential(live, deps({ credentials: [stored(live, { revoked: true, revokedAt })], profiles: {} }))
    expect(revoked.verdict).toBe('revoked')
    expect(revoked.times.map((t) => t.label)).toEqual(['Issued', 'Expires', 'Revoked'])

    const old = await makeCredential({ wallet, subject: key.did, issuedAt: new Date(Date.now() - 30 * DAY), expiresAt: new Date(Date.now() - 23 * DAY) })
    const expired = await verifyCredential(old, deps({ credentials: [stored(old)], profiles: {} }))
    expect(expired.verdict).toBe('expired')
    expect(status(expired)).toMatchObject({ signature: 'pass', validity: 'fail', revocation: 'pass' })
  })

  test('an unregistered credential is genuine but says Renown has no record; a failed lookup cannot be checked', async () => {
    const key = await makeAppKey()
    const credential = await makeCredential({ wallet: makeWallet(), subject: key.did, app: 'Vault' })
    const unregistered = await verifyCredential(credential, deps({ credentials: [], profiles: {} }))
    expect(unregistered.verdict).toBe('genuine')
    expect(status(unregistered).revocation).toBe('neutral')
    expect(unregistered.summary).toMatch(/Renown has no record of it\.$/)

    const down = await verifyCredential(credential, deps({ credentials: [], profiles: {}, down: true }))
    expect(down.verdict).toBe('unchecked')
    expect(status(down).revocation).toBe('unknown')
    expect(down.signer?.looked).toBe(false)
  })

  test('a junk copy under the same id from another issuer does not count as the record', async () => {
    const key = await makeAppKey()
    const credential = await makeCredential({ wallet: makeWallet(), subject: key.did })
    const junk = { ...stored(credential), issuerEthereumAddress: makeWallet().address.toLowerCase(), revoked: true }
    const report = await verifyCredential(credential, deps({ credentials: [junk], profiles: {} }))
    expect(status(report).revocation).toBe('neutral')
    expect(report.verdict).toBe('genuine')
  })

  test('a CLI session credential names no app', async () => {
    const wallet = makeWallet()
    const did = `did:pkh:eip155:1:${wallet.address.toLowerCase()}`
    const credential = await makeCredential({ wallet, subject: did, app: 'ph-cli' })
    const report = await verifyCredential(credential, deps({ credentials: [], profiles: {} }))
    expect(report.app).toMatchObject({ session: true })
    expect(report.summary).toContain('for a CLI or other session')
  })

  test('smart wallets: the chain decides when the offline check fails', async () => {
    const key = await makeAppKey()
    const credential = await makeCredential({ wallet: makeWallet(), subject: key.did })
    const tampered = { ...credential, credentialSubject: { id: key.did, app: 'Changed' } }
    const calls: string[] = []
    const asChain = (answer: ContractSignature) => deps({ credentials: [], profiles: {} }, {
      contractSignature: async (args) => {
        calls.push(`${args.chainId}:${args.address.toLowerCase()}`)
        return answer
      },
    })
    expect((await verifyCredential(tampered, asChain('valid'))).verdict).toBe('genuine')
    expect((await verifyCredential(tampered, asChain('invalid'))).verdict).toBe('not-genuine')
    expect((await verifyCredential(tampered, asChain('unavailable'))).verdict).toBe('unchecked')
    expect(calls).toHaveLength(3)
    // An EOA signature that verifies offline never asks the chain.
    await verifyCredential(credential, asChain('invalid'))
    expect(calls).toHaveLength(3)
  })

  test('checkContractSignature asks for code first and only then for the signature', async () => {
    const asked: string[] = []
    const reader = (code: `0x${string}` | undefined, valid: boolean | Error): ChainReader => ({
      async getCode() {
        asked.push('getCode')
        return code
      },
      async verifyTypedData() {
        asked.push('verifyTypedData')
        if (valid instanceof Error) throw valid
        return valid
      },
    })
    const args = { chainId: 1, address: '0x0000000000000000000000000000000000000abc', signature: '0x1234', typedData: {} }
    expect(await checkContractSignature(reader('0x', true), args)).toBe('not-contract')
    expect(asked).toEqual(['getCode'])
    expect(await checkContractSignature(reader('0x60806040', true), args)).toBe('valid')
    expect(await checkContractSignature(reader('0x60806040', false), args)).toBe('invalid')
    expect(await checkContractSignature(reader('0x60806040', new Error('rpc down')), args)).toBe('unavailable')
    // ERC-6492: not deployed yet, but the wrapped signature is still checked.
    const wrapped = { ...args, signature: `0xdead${'6492'.repeat(16)}` }
    expect(await checkContractSignature(reader(undefined, true), wrapped)).toBe('valid')
    expect(rpcUrl(1, undefined)).toBe('https://ethereum-rpc.publicnode.com')
    expect(rpcUrl(8453, 'abc')).toBe('https://base-mainnet.infura.io/v3/abc')
    expect(rpcUrl(8453, undefined)).toBeNull()
  })

  test('a credential id is looked up and its stored copy re-checked', async () => {
    const key = await makeAppKey()
    const credential = await makeCredential({ wallet: makeWallet(), subject: key.did })
    const row = stored(credential)
    const registry = { credentials: [row], profiles: {} }
    const found = await verifyCredentialId(row.credentialId, deps(registry))
    expect(found).toMatchObject({ kind: 'credential-id', verdict: 'genuine' })

    const missing = await verifyCredentialId('urn:uuid:00000000-0000-4000-8000-000000000000', deps(registry))
    expect(missing.verdict).toBe('not-genuine')

    // A stored copy whose dates came back at another precision cannot be re-checked: never "forged".
    const drifted = { ...row, issuanceDate: row.issuanceDate.replace('.000Z', 'Z').replace(/\.\d{3}Z$/, 'Z') }
    const report = await verifyCredentialId(row.credentialId, deps({ credentials: [drifted], profiles: {} }))
    expect(report.verdict).toBe('unchecked')
    expect(status(report).signature).toBe('unknown')

    const revoked = await verifyCredentialId(row.credentialId, deps({ credentials: [{ ...drifted, revoked: true, revokedAt: new Date().toISOString() }], profiles: {} }))
    expect(revoked.verdict).toBe('revoked')

    expect((await verifyCredentialId(row.credentialId, deps({ ...registry, down: true }))).verdict).toBe('unchecked')
  })
})

test.describe('/verify bearer tokens', () => {
  test('a token from an authorised app key is genuine', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: key.did, app: 'Vault' })
    const token = await makeBearerToken(key, wallet.address, { expiresIn: 600, aud: 'https://vault.example' })
    const report = await verifyToken(token, deps({ credentials: [stored(credential)], profiles: {} }))
    expect(report.verdict).toBe('genuine')
    expect(status(report)).toEqual({ signature: 'pass', validity: 'pass', delegation: 'pass', audience: 'neutral' })
    expect(report.signer?.address).toBe(wallet.address.toLowerCase())
    expect(report.app?.did).toBe(key.did)
  })

  test('a token without an authorising credential, or with a revoked one, does not speak for the user', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const token = await makeBearerToken(key, wallet.address)
    const none = await verifyToken(token, deps({ credentials: [], profiles: {} }))
    expect(none.verdict).toBe('not-genuine')
    expect(none.summary).toMatch(/never authorised this app key/)

    const credential = await makeCredential({ wallet, subject: key.did })
    const revoked = await verifyToken(token, deps({ credentials: [stored(credential, { revoked: true, revokedAt: new Date(Date.now() - 1000).toISOString() })], profiles: {} }))
    expect(revoked.verdict).toBe('revoked')

    const lapsed = await makeCredential({ wallet, subject: key.did, issuedAt: new Date(Date.now() - 10 * DAY), expiresAt: new Date(Date.now() - DAY) })
    expect((await verifyToken(token, deps({ credentials: [stored(lapsed)], profiles: {} }))).verdict).toBe('expired')
    expect((await verifyToken(token, deps({ credentials: [], profiles: {}, down: true }))).verdict).toBe('unchecked')
  })

  test('an expired token is expired, and a changed token is not genuine', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: key.did })
    const registry = { credentials: [stored(credential)], profiles: {} }
    const token = await makeBearerToken(key, wallet.address, { expiresIn: 60 })
    const later = await verifyToken(token, deps(registry, { now: new Date(Date.now() + 120_000) }))
    expect(later.verdict).toBe('expired')
    expect(status(later)).toMatchObject({ signature: 'pass', validity: 'fail' })

    const [h, p, s] = token.split('.')
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as { vc: { credentialSubject: { address: string } } }
    payload.vc.credentialSubject.address = makeWallet().address
    const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`
    const report = await verifyToken(forged, deps(registry))
    expect(report.verdict).toBe('not-genuine')
    expect(status(report)).toMatchObject({ signature: 'fail', delegation: 'neutral' })
  })
})

test.describe('/verify signed operations', () => {
  test('a v2 operation from an authorised key is genuine for its document and branch only', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: key.did, app: 'Connect' })
    const registry = { credentials: [stored(credential)], profiles: {} }
    const action = await makeV2Action({ key, address: wallet.address, documentId: 'doc-1', branch: 'main' })
    const report = await verifyOperation(action, { documentId: 'doc-1', branch: 'main' }, deps(registry))
    expect(report.verdict).toBe('genuine')
    expect(status(report)).toEqual({ binding: 'pass', signature: 'pass', delegation: 'pass', timing: 'neutral' })
    expect(report.summary).toMatch(/made this SET_NAME through Connect\. It has not been changed since\.$/)

    const otherDoc = await verifyOperation(action, { documentId: 'doc-2', branch: 'main' }, deps(registry))
    expect(otherDoc.verdict).toBe('not-genuine')
    expect(status(otherDoc).binding).toBe('fail')
    expect((await verifyOperation(action, { documentId: 'doc-1', branch: 'draft' }, deps(registry))).verdict).toBe('not-genuine')
  })

  test('a changed input or a swapped signature is not genuine', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const registry = { credentials: [stored(await makeCredential({ wallet, subject: key.did }))], profiles: {} }
    const action = await makeV2Action({ key, address: wallet.address, documentId: 'doc-1' })
    const changed = { ...action, input: { name: 'Changed' } }
    expect(status(await verifyOperation(changed, { documentId: 'doc-1', branch: 'main' }, deps(registry))).binding).toBe('fail')

    const other = await makeAppKey()
    const signer = (action.context as { signer: { app: { key: string } } }).signer
    const swapped = { ...action, context: { signer: { ...signer, app: { ...signer.app, key: other.did } } } }
    const report = await verifyOperation(swapped, { documentId: 'doc-1', branch: 'main' }, deps(registry))
    expect(report.verdict).toBe('not-genuine')
    expect(status(report).key).toBe('fail')
  })

  test('authorisation: a revocation counts whenever it happened, expiry is judged at the stated signing time', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: key.did, issuedAt: new Date(Date.now() - 2 * DAY) })
    const action = await makeV2Action({ key, address: wallet.address, documentId: 'doc-1' })
    const target = { documentId: 'doc-1', branch: 'main' }
    const later = new Date(Date.now() + 60_000).toISOString()
    const before = new Date(Date.now() - DAY).toISOString()
    // The signing time is the signer's own claim, so a revocation counts whenever it happened.
    const revokedLater = await verifyOperation(action, target, deps({ credentials: [stored(credential, { revoked: true, revokedAt: later })], profiles: {} }))
    expect(revokedLater.verdict).toBe('revoked')
    expect(revokedLater.summary).toContain("The signing time is the signer's own claim, so it cannot show the operation came before that.")
    expect((await verifyOperation(action, target, deps({ credentials: [stored(credential, { revoked: true, revokedAt: before })], profiles: {} }))).verdict).toBe('revoked')
    expect((await verifyOperation(action, target, deps({ credentials: [], profiles: {} }))).verdict).toBe('not-genuine')
    // Expiry and issuance are judged at the stated signing time, and the report says whose claim that is.
    const live = await verifyOperation(action, target, deps({ credentials: [stored(credential)], profiles: {} }))
    expect(live.verdict).toBe('genuine')
    expect(live.checks.find((c) => c.id === 'timing')).toMatchObject({ status: 'neutral', detail: expect.stringContaining("the signer's own claim") })
  })

  test('a legacy operation: hash, signature and authorisation are checked, and the report says the branch is not covered', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const registry = { credentials: [stored(await makeCredential({ wallet, subject: key.did }))], profiles: {} }
    const action = await makeLegacyAction({ key, address: wallet.address, documentId: 'doc-1' })
    const report = await verifyOperation(action, { documentId: 'doc-1', branch: 'draft' }, deps(registry))
    expect(report.verdict).toBe('genuine')
    expect(status(report)).toEqual({ binding: 'pass', signature: 'pass', delegation: 'pass', timing: 'neutral' })
    expect(report.summary).toContain('a legacy signature, which does not cover the branch')

    const signer = (action.context as { signer: { signatures: string[][] } }).signer
    const tuple = [...signer.signatures[0]]
    tuple[4] = tuple[4].slice(0, -2) + (tuple[4].endsWith('00') ? '01' : '00')
    const broken = { ...action, context: { signer: { ...signer, signatures: [tuple] } } }
    expect(status(await verifyOperation(broken, { documentId: 'doc-1', branch: 'main' }, deps(registry))).signature).toBe('fail')
  })

  test('an operation without a signer or with a malformed tuple cannot be checked', async () => {
    const target = { documentId: 'doc-1', branch: 'main' }
    const report = await verifyOperation({ id: 'a', type: 'X', context: { signer: { app: { key: 'did:key:zX' }, user: { address: '0x1' }, signatures: [] } } }, target, deps({ credentials: [], profiles: {} }))
    expect(report).toMatchObject({ verdict: 'not-genuine', checks: [{ id: 'shape', status: 'fail', detail: 'It carries no signature.' }] })
  })
})

test.describe('/verify DIDs', () => {
  test('a wallet DID shows its profile or says there is none', async () => {
    const wallet = makeWallet()
    const address = wallet.address.toLowerCase()
    const withProfile = await verifyWalletDid(`did:pkh:eip155:1:${address}`, address, 1, deps({ credentials: [], profiles: { [address]: { documentId: 'd', handle: 'ann', displayName: null, username: null, avatar: null } } }))
    expect(withProfile).toMatchObject({ verdict: 'identity', summary: expect.stringContaining('is @ann on Renown') })
    const without = await verifyWalletDid(`did:pkh:eip155:1:${address}`, address, 1, deps({ credentials: [], profiles: {} }))
    expect(without.summary).toMatch(/has no public profile\.$/)
    const down = await verifyWalletDid(`did:pkh:eip155:1:${address}`, address, 1, deps({ credentials: [], profiles: {}, down: true }))
    expect(down.checks[1].status).toBe('unknown')
  })

  test('an app DID is a P-256 key with or without a profile', async () => {
    const key = await makeAppKey()
    const report = await verifyAppDid(key.did, deps({ credentials: [], profiles: {} }))
    expect(report).toMatchObject({ verdict: 'identity', checks: [{ status: 'pass' }, { status: 'neutral' }] })
    const ed25519 = await verifyAppDid('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK', deps({ credentials: [], profiles: {} }))
    expect(ed25519.checks[0].status).toBe('neutral')
  })
})

// Fix round 1: each case below was reproduced against a13b933 by the Task 3 review.

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function jwtParts(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> } {
  const [h, p] = token.split('.')
  return { header: JSON.parse(Buffer.from(h, 'base64url').toString()), payload: JSON.parse(Buffer.from(p, 'base64url').toString()) }
}

/** A JWT with any header and payload, ES256-signed by `key` over header.payload. */
async function signJwt(key: AppKey, header: Record<string, unknown>, payload: Record<string, unknown>): Promise<string> {
  const signingInput = `${b64url(header)}.${b64url(payload)}`
  const signature = await key.sign(new TextEncoder().encode(signingInput))
  return `${signingInput}.${Buffer.from(signature).toString('base64url')}`
}

/** A legacy-tuple action whose hash is `hash`, signed by `key` the way the reactor checks it. */
async function legacyTupleAction(
  key: AppKey,
  address: string,
  action: Record<string, unknown>,
  hash: string,
  timestamp = String(Math.floor(Date.now() / 1000)),
): Promise<Record<string, unknown>> {
  const shared = await import('@powerhousedao/shared/document-model')
  const signature = await key.sign(shared.buildOperationSignatureMessage([timestamp, key.did, hash, '']))
  const tuple = [timestamp, key.did, hash, '', `0x${Buffer.from(signature).toString('hex')}`]
  return {
    ...action,
    context: { signer: { user: { address, networkId: 'eip155', chainId: 1 }, app: { name: 'Connect', key: key.did }, signatures: [tuple] } },
  }
}

async function renownLegacyHash(action: { scope: string; type: string; input: unknown }): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${action.scope}${action.type}${JSON.stringify(action.input)}`))
  return Buffer.from(digest).toString('base64')
}

test.describe('/verify fix round 1: legacy operations', () => {
  test('C1: a legacy (shared) operation is bound to its content and document, not its branch', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const registry = { credentials: [stored(await makeCredential({ wallet, subject: key.did }))], profiles: {} }
    const action = await makeLegacyAction({ key, address: wallet.address, documentId: 'doc-1' })
    const target = { documentId: 'doc-1', branch: 'main' }

    const tampered = await verifyOperation({ ...action, type: 'DELETE_EVERYTHING', input: { x: 1 } }, target, deps(registry))
    expect(tampered.verdict).toBe('not-genuine')
    expect(status(tampered).binding).toBe('fail')
    expect(tampered.summary).not.toContain('has not been changed')

    const otherDoc = await verifyOperation(action, { documentId: 'doc-2', branch: 'main' }, deps(registry))
    expect(otherDoc.verdict).toBe('not-genuine')

    const noDoc = await verifyOperation(action, { documentId: '', branch: 'main' }, deps(registry))
    expect(noDoc.verdict).toBe('unchecked')
    expect(status(noDoc).binding).toBe('unknown')
  })

  test('C1: a legacy (renown) operation covers its content only, and an unknown legacy hash cannot be checked', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const registry = { credentials: [stored(await makeCredential({ wallet, subject: key.did, app: 'Connect' }))], profiles: {} }
    const base = { id: 'a-1', type: 'SET_NAME', scope: 'global', timestampUtcMs: new Date().toISOString(), input: { name: 'Report' } }
    const action = await legacyTupleAction(key, wallet.address, base, await renownLegacyHash(base))
    const target = { documentId: '', branch: 'main' }

    const report = await verifyOperation(action, target, deps(registry))
    expect(report.verdict).toBe('genuine')
    expect(report.checks.find((c) => c.id === 'binding')?.detail).toMatch(/does not cover which document or branch/)
    expect(report.summary).toContain('a legacy signature, which does not cover the document or branch')

    const tampered = await verifyOperation({ ...action, input: { name: 'Changed' } }, target, deps(registry))
    expect(tampered.verdict).toBe('not-genuine')
    expect(status(tampered).binding).toBe('fail')

    const unknown = await verifyOperation(await legacyTupleAction(key, wallet.address, base, 'abcdef0123'), { documentId: 'doc-1', branch: 'main' }, deps(registry))
    expect(unknown.verdict).toBe('unchecked')
    expect(status(unknown)).toMatchObject({ binding: 'unknown', signature: 'pass' })
  })
})

test.describe('/verify fix round 1: operations', () => {
  test('I1: the app is named by the authorising credential, never by the unsigned signer name', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const registry = { credentials: [stored(await makeCredential({ wallet, subject: key.did, app: 'Vault' }))], profiles: {} }
    const action = await makeV2Action({ key, address: wallet.address, documentId: 'doc-1', appName: 'Coinbase Wallet' })
    const target = { documentId: 'doc-1', branch: 'main' }
    const report = await verifyOperation(action, target, deps(registry))
    expect(report.verdict).toBe('genuine')
    expect(report.summary).toContain('through Vault.')
    expect(report.summary).not.toContain('Coinbase')
    expect(report.app?.claimedName).toBe('Vault')

    const none = await verifyOperation(action, target, deps({ credentials: [], profiles: {} }))
    expect(none.app?.claimedName).toBeNull()
  })
})

test.describe('/verify fix round 1: bearer tokens', () => {
  test('I2: a token with any alg other than ES256 is not genuine, even when it has expired', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const registry = { credentials: [stored(await makeCredential({ wallet, subject: key.did }))], profiles: {} }
    const { header, payload } = jwtParts(await makeBearerToken(key, wallet.address, { expiresIn: 600 }))
    for (const alg of ['none', 'HS256']) {
      const forged = `${b64url({ ...header, alg })}.${b64url({ ...payload, exp: Math.floor(Date.now() / 1000) - 60 })}.`
      const report = await verifyToken(forged, deps(registry))
      expect(report.verdict, alg).toBe('not-genuine')
      expect(status(report).signature, alg).toBe('fail')
    }
  })

  test('I3: an expired token from a key nobody authorised is not genuine', async () => {
    const key = await makeAppKey()
    const token = await makeBearerToken(key, makeWallet().address, { expiresIn: 60 })
    const report = await verifyToken(token, deps({ credentials: [], profiles: {} }, { now: new Date(Date.now() + 120_000) }))
    expect(report.verdict).toBe('not-genuine')
    expect(status(report)).toMatchObject({ signature: 'pass', validity: 'fail', delegation: 'fail' })
    expect(report.summary).toMatch(/never authorised this app key/)
  })

  test('I4: the summary names the check that failed (refused contents, not yet valid)', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const registry = { credentials: [stored(await makeCredential({ wallet, subject: key.did }))], profiles: {} }
    const { header, payload } = jwtParts(await makeBearerToken(key, wallet.address, { expiresIn: 600 }))

    const vc = payload.vc as { credentialSubject: Record<string, unknown> }
    const { chainId: _c, networkId: _n, ...subject } = vc.credentialSubject
    const refused = await verifyToken(await signJwt(key, header, { ...payload, vc: { ...vc, credentialSubject: subject } }), deps(registry))
    expect(refused.verdict).toBe('not-genuine')
    expect(status(refused)).toMatchObject({ signature: 'pass', shape: 'fail' })
    expect(refused.summary).not.toMatch(/never authorised|forged/)
    expect(refused.summary).toMatch(/not a valid Renown sign-in token/)

    const notYet = await verifyToken(await signJwt(key, header, { ...payload, nbf: Math.floor(Date.now() / 1000) + 3600 }), deps(registry))
    // Signed by its key, only not valid yet (Task 4 fix round 1: not "Not genuine").
    expect(notYet.verdict).toBe('not-yet-valid')
    expect(status(notYet)).toMatchObject({ signature: 'pass', validity: 'fail' })
    expect(notYet.summary).not.toMatch(/forged|never authorised/)
    expect(notYet.summary).toMatch(/^This token is not valid before /)
  })
})

test.describe('/verify fix round 1: credentials', () => {
  test('I5: when the signature could not be checked, no summary says the wallet signed it', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const old = await makeCredential({ wallet, subject: key.did, chainId: 8453, issuedAt: new Date(Date.now() - 30 * DAY), expiresAt: new Date(Date.now() - 23 * DAY) })
    const tampered = { ...old, credentialSubject: { id: key.did, app: 'Anything' } }
    const unavailable = { contractSignature: async () => 'unavailable' as const }

    const expired = await verifyCredential(tampered, deps({ credentials: [], profiles: {} }, unavailable))
    expect(expired.verdict).toBe('expired')
    expect(status(expired).signature).toBe('unknown')
    expect(expired.summary).not.toContain('signed this credential')
    expect(expired.summary).toContain('claims to be signed by')

    const live = await makeCredential({ wallet, subject: key.did, chainId: 8453 })
    const liveTampered = { ...live, credentialSubject: { id: key.did, app: 'Anything' } }
    const revoked = await verifyCredential(liveTampered, deps({ credentials: [stored(live, { revoked: true, revokedAt: new Date().toISOString() })], profiles: {} }, unavailable))
    expect(revoked.verdict).toBe('revoked')
    expect(revoked.summary).not.toContain('signed this credential')
    expect(revoked.summary).toContain('claims to be signed by')

    const unchecked = await verifyCredential(liveTampered, deps({ credentials: [], profiles: {} }, unavailable))
    expect(unchecked.verdict).toBe('unchecked')
    expect(unchecked.summary).toContain('claims to be signed by')
  })

  test('minor: a credential dated in the future does not say it is no longer in date', async () => {
    const key = await makeAppKey()
    const credential = await makeCredential({ wallet: makeWallet(), subject: key.did, issuedAt: new Date(Date.now() + DAY) })
    const report = await verifyCredential(credential, deps({ credentials: [], profiles: {} }))
    expect(status(report).validity).toBe('fail')
    // Not "expired": its validity has not started yet.
    expect(report.verdict).toBe('not-yet-valid')
    expect(report.summary).not.toMatch(/no longer in date/)
    expect(report.summary).toMatch(/dated in the future/)
  })
})

test.describe('/verify fix round 1: live dependencies', () => {
  test('minor: liveDeps reads the clock when a check runs, not when it was made', async () => {
    const deps = liveDeps()
    const made = Date.now()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(deps.now.getTime()).toBeGreaterThanOrEqual(made + 40)
  })

  test('minor: a chain that never answers gives up within the deadline', async () => {
    test.setTimeout(5_000)
    const hang: ChainReader = { getCode: () => new Promise(() => undefined), verifyTypedData: () => new Promise(() => undefined) }
    const args = { chainId: 1, address: '0x0000000000000000000000000000000000000abc', signature: '0x1234', typedData: {} }
    const started = Date.now()
    expect(await checkContractSignature(hang, args, 100)).toBe('unavailable')
    expect(Date.now() - started).toBeLessThan(2_000)
  })
})

// Fix round 2: a revoked credential for the key wins over any other, whatever the stated signing time.

/** The v2 action re-signed with a tuple time of `at` (the signer chooses it; nothing else changes). */
async function backdated(action: Record<string, unknown>, key: AppKey, at: Date): Promise<Record<string, unknown>> {
  const shared = await import('@powerhousedao/shared/document-model')
  const signer = (action.context as { signer: { signatures: string[][] } }).signer
  const [, k, hash, prev] = signer.signatures[0]
  const timestamp = String(Math.floor(at.getTime() / 1000))
  const signature = await key.sign(shared.buildOperationSignatureMessage([timestamp, k, hash, prev]))
  return { ...action, context: { signer: { ...signer, signatures: [[timestamp, k, hash, prev, `0x${Buffer.from(signature).toString('hex')}`]] } } }
}

test.describe('/verify fix round 2: revocation wins', () => {
  test('I6: an old unrevoked credential does not cover an operation backdated into its window once a newer one is revoked', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const old = await makeCredential({ wallet, subject: key.did, issuedAt: new Date(Date.now() - 30 * DAY), expiresAt: new Date(Date.now() - 10 * DAY) })
    const newer = await makeCredential({ wallet, subject: key.did, issuedAt: new Date(Date.now() - 5 * DAY) })
    const revokedAt = new Date(Date.now() - DAY).toISOString()
    const registry = { credentials: [stored(old), stored(newer, { revoked: true, revokedAt })], profiles: {} }
    const action = await backdated(await makeV2Action({ key, address: wallet.address, documentId: 'doc-1' }), key, new Date(Date.now() - 20 * DAY))
    const report = await verifyOperation(action, { documentId: 'doc-1', branch: 'main' }, deps(registry))
    expect(status(report)).toMatchObject({ binding: 'pass', signature: 'pass', delegation: 'fail' })
    expect(report.verdict).toBe('revoked')
    expect(report.summary).toContain("The signing time is the signer's own claim, so it cannot show the operation came before that.")
  })

  test('I6: a single revoked credential stays revoked for an operation dated after its expiry', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: key.did, issuedAt: new Date(Date.now() - 10 * DAY), expiresAt: new Date(Date.now() - 5 * DAY) })
    const registry = { credentials: [stored(credential, { revoked: true, revokedAt: new Date(Date.now() - 6 * DAY).toISOString() })], profiles: {} }
    const action = await makeV2Action({ key, address: wallet.address, documentId: 'doc-1' })
    const report = await verifyOperation(action, { documentId: 'doc-1', branch: 'main' }, deps(registry))
    expect(report.verdict).toBe('revoked')
  })
})

test.describe('/verify page fix round 1: verdicts', () => {
  test('a correctly signed token that is not valid yet is "not-yet-valid"; a forged one stays not genuine', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const registry = { credentials: [stored(await makeCredential({ wallet, subject: key.did }))], profiles: {} }
    const { header, payload } = jwtParts(await makeBearerToken(key, wallet.address, { expiresIn: 7200 }))
    const early = await signJwt(key, header, { ...payload, nbf: Math.floor(Date.now() / 1000) + 3600 })
    const report = await verifyToken(early, deps(registry))
    expect(report.verdict).toBe('not-yet-valid')
    expect(status(report)).toMatchObject({ signature: 'pass', validity: 'fail' })
    expect(report.summary).toMatch(/^This token is not valid before /)

    const [h, p, s] = early.split('.')
    const changed = JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...changed, sub: 'did:key:zDnaeForgedForgedForgedForgedForgedForged1' })).toString('base64url')}.${s}`
    const bad = await verifyToken(forged, deps(registry))
    expect(bad.verdict).toBe('not-genuine')
  })

  test('a forged token does not say it is in date: later checks are not checked', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const registry = { credentials: [stored(await makeCredential({ wallet, subject: key.did }))], profiles: {} }
    const token = await makeBearerToken(key, wallet.address, { expiresIn: 600 })
    const report = await verifyToken(token.slice(0, -4) + 'AAAA', deps(registry))
    expect(report.verdict).toBe('not-genuine')
    expect(status(report)).toMatchObject({ signature: 'fail', validity: 'neutral', delegation: 'neutral' })
    expect(report.checks.find((c) => c.id === 'validity')?.detail).toBe(SKIPPED_DETAIL)
  })

  test('a genuine credential whose dates cannot be read is "not-valid", not expired', async () => {
    const key = await makeAppKey()
    const credential = await makeCredential({ wallet: makeWallet(), subject: key.did, rawIssuanceDate: 'not a date' })
    const report = await verifyCredential(credential, deps({ credentials: [], profiles: {} }))
    expect(status(report)).toMatchObject({ signature: 'pass', validity: 'fail' })
    expect(report.verdict).toBe('not-valid')
    expect(report.summary).toMatch(/its dates cannot be read/)
  })
})

test.describe('/verify final fix wave', () => {
  test('I1: the signer card says "Signed by" only for a signature that holds from a key the signer authorised', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: key.did, app: 'Vault' })
    const token = await makeBearerToken(key, wallet.address, { expiresIn: 600 })
    const authorised = { credentials: [stored(credential)], profiles: {} }
    const nobody = { credentials: [], profiles: {} }

    expect(signerHeading(await verifyToken(token, deps(authorised)))).toBe('Signed by')
    const unauthorised = await verifyToken(token, deps(nobody))
    expect(unauthorised.verdict).toBe('not-genuine')
    expect(signerHeading(unauthorised)).toBe('Claims to be signed by')
    expect(signerHeading(await verifyToken(token, deps({ ...authorised, down: true })))).toBe('Claims to be signed by')
    const revoked = { credentials: [stored(credential, { revoked: true, revokedAt: new Date().toISOString() })], profiles: {} }
    expect(signerHeading(await verifyToken(token, deps(revoked)))).toBe('Claims to be signed by')

    const action = await makeV2Action({ key, address: wallet.address, documentId: 'doc-1' })
    const target = { documentId: 'doc-1', branch: 'main' }
    expect(signerHeading(await verifyOperation(action, target, deps(authorised)))).toBe('Signed by')
    expect(signerHeading(await verifyOperation(action, target, deps(nobody)))).toBe('Claims to be signed by')

    // A signature that could not be checked vouches for nobody.
    const tampered = { ...credential, credentialSubject: { id: key.did, app: 'Anything' } }
    const unchecked = await verifyCredential(tampered, deps(nobody, { contractSignature: async () => 'unavailable' }))
    expect(status(unchecked).signature).toBe('unknown')
    expect(signerHeading(unchecked)).toBe('Claims to be signed by')
    expect(signerHeading(await verifyCredential(credential, deps(authorised)))).toBe('Signed by')
    expect(signerHeading(await verifyWalletDid(`did:pkh:eip155:1:${wallet.address.toLowerCase()}`, wallet.address.toLowerCase(), 1, deps(nobody)))).toBe('Identity')
  })

  test('I2: a credential id stored by more than one wallet cannot be checked by id', async () => {
    const key = await makeAppKey()
    const theirs = await makeCredential({ wallet: makeWallet(), subject: key.did })
    const planted = await makeCredential({ wallet: makeWallet(), subject: key.did, id: theirs.id as string })
    const registry = {
      credentials: [stored(planted), stored(theirs, { revoked: true, revokedAt: new Date().toISOString() })],
      profiles: {},
    }
    const report = await verifyCredentialId(theirs.id as string, deps(registry))
    expect(report.verdict).toBe('unchecked')
    expect(report.summary).toBe('More than one wallet has stored a credential with this id. Paste the full credential to check the one you have.')
    expect(report.signer).toBeNull()

    // Two copies from one wallet are still one issuer: checked as before.
    const one = await verifyCredentialId(theirs.id as string, deps({ credentials: [stored(theirs), stored(theirs)], profiles: {} }))
    expect(one.verdict).toBe('genuine')
  })

  test('I4: a document-level action names the document its hash covers, not the one entered', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const registry = { credentials: [stored(await makeCredential({ wallet, subject: key.did, issuedAt: new Date(Date.now() - 60_000) }))], profiles: {} }
    const action = await makeV2Action({
      key,
      address: wallet.address,
      documentId: 'doc-made',
      type: 'CREATE_DOCUMENT',
      input: { documentId: 'doc-made', model: 'powerhouse/document-model', version: 0 },
    })

    const same = await verifyOperation(action, { documentId: 'doc-made', branch: 'main' }, deps(registry))
    expect(status(same).binding).toBe('pass')
    expect(same.checks.find((c) => c.id === 'binding')?.detail).toBe('It was signed for document doc-made on branch main, with exactly this content.')

    const other = await verifyOperation(action, { documentId: 'doc-entered', branch: 'main' }, deps(registry))
    expect(status(other).binding).toBe('pass')
    const detail = other.checks.find((c) => c.id === 'binding')?.detail ?? ''
    expect(detail).toContain('signed for document doc-made on branch main')
    expect(detail).toContain('not the document you entered (doc-entered)')
    expect(detail).not.toContain('signed for document doc-entered')
  })

  test('minor: a legacy signature does not claim more than its hash covers', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const registry = { credentials: [stored(await makeCredential({ wallet, subject: key.did, app: 'Connect' }))], profiles: {} }
    const base = { id: 'a-1', type: 'SET_NAME', scope: 'global', timestampUtcMs: new Date().toISOString(), input: { name: 'Report' } }
    const legacy = await verifyOperation(await legacyTupleAction(key, wallet.address, base, await renownLegacyHash(base)), { documentId: '', branch: 'main' }, deps(registry))
    expect(legacy.verdict).toBe('genuine')
    expect(legacy.summary).toContain('Its content has not been changed since.')
    expect(legacy.summary).not.toContain('It has not been changed since')
    expect(legacy.times.map((t) => t.label)).toEqual(['Signed', 'Action time (not signed)'])

    const v2 = await verifyOperation(await makeV2Action({ key, address: wallet.address, documentId: 'doc-1' }), { documentId: 'doc-1', branch: 'main' }, deps(registry))
    expect(v2.times.map((t) => t.label)).toEqual(['Signed', 'Action time'])
  })

  test('minor: an operation without a signing time does not mention the signing time it states', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const registry = { credentials: [stored(await makeCredential({ wallet, subject: key.did }))], profiles: {} }
    const base = { id: 'a-2', type: 'SET_NAME', scope: 'global', timestampUtcMs: new Date().toISOString(), input: { name: 'Report' } }
    const report = await verifyOperation(await legacyTupleAction(key, wallet.address, base, await renownLegacyHash(base), 'soon'), { documentId: '', branch: 'main' }, deps(registry))
    expect(report.verdict).toBe('not-genuine')
    expect(status(report)).toMatchObject({ binding: 'pass', signature: 'pass', delegation: 'fail' })
    expect(report.summary).not.toContain('the signing time it states')
    expect(report.summary).toContain('carries no signing time')
  })

  test('minor: a credential that names its signer inconsistently does not say its signature was checked', async () => {
    const key = await makeAppKey()
    const credential = await makeCredential({ wallet: makeWallet(), subject: key.did })
    const report = await verifyCredential({ ...credential, issuer: { id: 'did:web:example.com', ethereumAddress: (credential.issuer as { ethereumAddress: string }).ethereumAddress } }, deps({ credentials: [], profiles: {} }))
    expect(report.verdict).toBe('not-genuine')
    expect(report.summary).toMatch(/^This credential does not name its signer consistently, so it proves nothing about 0x/)

    const changed = await verifyCredential({ ...credential, credentialSubject: { id: key.did, app: 'Other' } }, deps({ credentials: [], profiles: {} }))
    expect(changed.summary).toMatch(/^This credential was not signed by the wallet it names/)
  })
})
