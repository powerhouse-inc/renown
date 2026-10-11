// Real signed artefacts for the /verify tests, made in the Playwright worker
// (Node) with fresh keys on every run: an EIP-712 delegation credential signed
// by a viem test account, a bearer token signed by a P-256 app key, and v2 and
// legacy signed operations. Nothing here is mocked crypto.
import type { Action } from '@powerhousedao/shared/document-model'
import { createAuthBearerToken } from '@renown/sdk'
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58(bytes: Uint8Array): string {
  let n = BigInt(0)
  for (const b of bytes) n = n * BigInt(256) + BigInt(b)
  let out = ''
  while (n > BigInt(0)) {
    out = BASE58[Number(n % BigInt(58))] + out
    n /= BigInt(58)
  }
  for (const b of bytes) {
    if (b !== 0) break
    out = '1' + out
  }
  return out
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

export interface AppKey {
  did: string
  /** ECDSA P-256 / SHA-256, 64 bytes r || s (what WebCrypto and the reactor use). */
  sign(data: Uint8Array): Promise<Uint8Array>
}

/** A fresh P-256 key as a did:key, the way Renown apps hold theirs. */
export async function makeAppKey(): Promise<AppKey> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const compressed = new Uint8Array(33)
  compressed[0] = 2 + (raw[64] & 1)
  compressed.set(raw.subarray(1, 33), 1)
  return {
    did: `did:key:z${base58(Uint8Array.from([0x80, 0x24, ...compressed]))}`,
    async sign(data) {
      return new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, data as BufferSource))
    },
  }
}

export function makeWallet(): PrivateKeyAccount {
  return privateKeyToAccount(generatePrivateKey())
}

const CREDENTIAL_TYPES = {
  VerifiableCredential: [
    { name: '@context', type: 'string[]' },
    { name: 'type', type: 'string[]' },
    { name: 'id', type: 'string' },
    { name: 'issuer', type: 'Issuer' },
    { name: 'credentialSubject', type: 'CredentialSubject' },
    { name: 'credentialSchema', type: 'CredentialSchema' },
    { name: 'issuanceDate', type: 'string' },
    { name: 'expirationDate', type: 'string' },
  ],
  CredentialSchema: [
    { name: 'id', type: 'string' },
    { name: 'type', type: 'string' },
  ],
  CredentialSubject: [
    { name: 'app', type: 'string' },
    { name: 'id', type: 'string' },
  ],
  Issuer: [
    { name: 'id', type: 'string' },
    { name: 'ethereumAddress', type: 'string' },
  ],
} as const

export interface CredentialOptions {
  wallet: PrivateKeyAccount
  /** The app key it authorises; the wallet's own DID for a CLI session. */
  subject: string
  app?: string
  issuedAt?: Date
  expiresAt?: Date
  chainId?: number
  id?: string
}

/** A Renown delegation credential exactly as renown.id builds and signs it (services/wallet/credentials.ts). */
export async function makeCredential(options: CredentialOptions): Promise<Record<string, unknown>> {
  const { wallet, subject, app = 'Test app', chainId = 1 } = options
  const issuedAt = options.issuedAt ?? new Date(Date.now() - 60_000)
  const expiresAt = options.expiresAt ?? new Date(issuedAt.getTime() + 7 * 86_400_000)
  const issuerId = `did:pkh:eip155:${chainId}:${wallet.address.toLowerCase()}`
  const credential = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'RenownCredential'],
    id: options.id ?? `urn:uuid:${crypto.randomUUID()}`,
    issuer: { id: issuerId, ethereumAddress: wallet.address },
    credentialSubject: { id: subject, app },
    credentialSchema: { id: 'https://renown.id/schemas/renown-credential/v1', type: 'JsonSchemaValidator2018' },
    issuanceDate: issuedAt.toISOString(),
    expirationDate: expiresAt.toISOString(),
  }
  const domain = { version: '1', chainId }
  const proofValue = await wallet.signTypedData({
    domain,
    types: CREDENTIAL_TYPES,
    primaryType: 'VerifiableCredential',
    message: credential,
  })
  return {
    ...credential,
    proof: {
      type: 'EthereumEip712Signature2021',
      created: credential.issuanceDate,
      verificationMethod: issuerId,
      proofPurpose: 'assertionMethod',
      proofValue,
      ethereumAddress: wallet.address,
      eip712: { domain, primaryType: 'VerifiableCredential' },
    },
  }
}

/** A Renown bearer token for `address`, signed by `key` through the SDK. */
export async function makeBearerToken(
  key: AppKey,
  address: string,
  options: { expiresIn?: number; aud?: string } = {},
): Promise<string> {
  const signer = async (data: string | Uint8Array) =>
    base64Url(await key.sign(typeof data === 'string' ? new TextEncoder().encode(data) : data))
  return createAuthBearerToken(1, 'eip155', address, { did: key.did, signer, alg: 'ES256' }, options)
}

export interface ActionOptions {
  key: AppKey
  address: string
  documentId: string
  branch?: string
  type?: string
  input?: unknown
  appName?: string
}

function baseAction(options: ActionOptions): Action {
  return {
    id: crypto.randomUUID(),
    type: options.type ?? 'SET_NAME',
    timestampUtcMs: new Date().toISOString(),
    input: options.input ?? { name: 'Quarterly report' },
    scope: 'global',
  }
}

// @powerhousedao/shared ships ESM only ("import" condition): loaded with import(),
// which the Playwright worker keeps native.
const shared = () => import('@powerhousedao/shared/document-model')

async function signerOf(options: ActionOptions) {
  return (await shared()).actionSignerIdentity({
    user: { address: options.address, networkId: 'eip155', chainId: 1 },
    app: { name: options.appName ?? 'Connect', key: options.key.did },
  })
}

/** An action signed with a v2 tuple (bound to documentId and branch), as the reactor signs it. */
export async function makeV2Action(options: ActionOptions): Promise<Record<string, unknown>> {
  const action = baseAction(options)
  const signer = await signerOf(options)
  const tuple = await (await shared()).signActionV2({
    action,
    target: { documentId: options.documentId, branch: options.branch ?? 'main' },
    signer,
    sign: (message) => options.key.sign(message),
  })
  return { ...action, context: { signer: { ...signer, signatures: [tuple] } } }
}

/** An action signed with a legacy (SHA-1, unbound) tuple. */
export async function makeLegacyAction(options: ActionOptions): Promise<Record<string, unknown>> {
  const action = baseAction(options)
  const signer = await signerOf(options)
  const tuple = await (await shared()).buildOperationSignature(
    { documentId: options.documentId, signer: { ...signer, signatures: [] }, action, previousStateHash: '' },
    (message) => options.key.sign(message),
  )
  return { ...action, context: { signer: { ...signer, signatures: [tuple] } } }
}
