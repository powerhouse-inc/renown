// What a /verify paste is, decided from its shape alone. Pure.
import { isAttestationShape } from './attestation'
import type { InputKind } from './types'

/** Pastes longer than this are refused before parsing (a credential is ~2 KB, an operation rarely 20 KB). */
export const MAX_INPUT_LENGTH = 100_000

export type Detected =
  | { kind: 'did-pkh'; did: string; address: string; chainId: number }
  | { kind: 'did-key'; did: string }
  | { kind: 'credential-id'; credentialId: string }
  | { kind: 'token'; jwt: string }
  | { kind: 'credential'; credential: Record<string, unknown> }
  | { kind: 'operation'; action: Record<string, unknown> }
  | { kind: 'release-attestation'; attestation: Record<string, unknown> }
  | { kind: null; problem: DetectProblem }

export type DetectProblem = 'empty' | 'too-long' | 'unrecognised' | 'json-unrecognised' | 'json-invalid'

const PKH_RE = /^did:pkh:eip155:(\d{1,12}):(0x[0-9a-fA-F]{40})$/
const DID_KEY_RE = /^did:key:z[1-9A-HJ-NP-Za-km-z]{32,128}$/
const UUID_URN_RE = /^urn:uuid:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const JWT_RE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/

/** A short noun phrase for the detected kind ("a bearer token"), for the hint under the input. */
export const KIND_NAMES: Record<InputKind, string> = {
  'did-pkh': 'a Renown identity (DID)',
  'did-key': 'an app key (DID)',
  credential: 'a Renown credential',
  token: 'a bearer token',
  'credential-id': 'a credential id',
  operation: 'a signed operation',
  'release-attestation': 'a release attestation',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jwtHeaderIsJson(jwt: string): boolean {
  try {
    const part = jwt.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')
    const header: unknown = JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)))
    return isRecord(header) && typeof header.alg === 'string'
  } catch {
    return false
  }
}

function isCredential(value: Record<string, unknown>): boolean {
  const proof = value.proof
  return (
    Array.isArray(value.type) &&
    value.type.includes('RenownCredential') &&
    isRecord(proof) &&
    isRecord(proof.eip712)
  )
}

/** The signed action in a pasted action, or in an operation that wraps one. */
function signedAction(value: Record<string, unknown>): Record<string, unknown> | null {
  for (const candidate of [value, value.action]) {
    if (!isRecord(candidate)) continue
    const context = candidate.context
    if (isRecord(context) && isRecord(context.signer) && Array.isArray(context.signer.signatures)) return candidate
  }
  return null
}

/** Classifies a paste. Whitespace around it and a leading "Bearer " are ignored. */
export function detectInput(raw: string): Detected {
  if (raw.length > MAX_INPUT_LENGTH) return { kind: null, problem: 'too-long' }
  const text = raw.trim()
  if (!text) return { kind: null, problem: 'empty' }

  const pkh = PKH_RE.exec(text)
  if (pkh) return { kind: 'did-pkh', did: text, address: pkh[2].toLowerCase(), chainId: Number(pkh[1]) }
  if (DID_KEY_RE.test(text)) return { kind: 'did-key', did: text }
  if (UUID_URN_RE.test(text)) return { kind: 'credential-id', credentialId: text }

  const bearer = text.replace(/^Bearer\s+/i, '')
  if (JWT_RE.test(bearer) && jwtHeaderIsJson(bearer)) return { kind: 'token', jwt: bearer }

  if (text.startsWith('{')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return { kind: null, problem: 'json-invalid' }
    }
    if (!isRecord(parsed)) return { kind: null, problem: 'json-unrecognised' }
    if (isCredential(parsed)) return { kind: 'credential', credential: parsed }
    const action = signedAction(parsed)
    if (action) return { kind: 'operation', action }
    if (isAttestationShape(parsed)) return { kind: 'release-attestation', attestation: parsed }
    return { kind: null, problem: 'json-unrecognised' }
  }
  return { kind: null, problem: 'unrecognised' }
}

/** What to tell someone whose paste was not recognised. */
export const PROBLEM_TEXT: Record<DetectProblem, string> = {
  empty: 'Paste a DID, credential, token or signed operation.',
  'too-long': 'This is longer than anything Renown signs. Paste a single credential, token or operation.',
  unrecognised:
    'This is not a DID, a credential id, a bearer token or JSON. Check that nothing was cut off when you copied it.',
  'json-invalid': 'This looks like JSON but does not parse. Check that nothing was cut off when you copied it.',
  'json-unrecognised':
    'This JSON is not a Renown credential, a signed operation or a release attestation. A credential has a proof with eip712; an operation has context.signer.signatures; an attestation has appDid, version, artifactDigest, signer and signature.',
}
