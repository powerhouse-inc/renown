// /verify for a signed document operation: does the v2 hash bind this action
// to the given document and branch, is the P-256 signature the app key's, and
// did the user authorise that key? Mirrors the reactor's verifyActionSignature
// on its mutation path (integrity, legacy hashes included) plus the Renown
// trust lookup (identity).
// @powerhousedao/shared is loaded only when an operation is checked.
import { appName, formatDay, formatInstant, sentence, shortAddress, signerName } from './format'
import { hexToBytes, verifyP256 } from './p256'
import { appParty, checkDelegation, signerParty, type Delegation } from './parties'
import { SKIPPED_DETAIL, type Check, type Report, type Verdict, type VerifyDeps } from './types'

type Tuple = [string, string, string, string, string]

/** Legacy hash lengths, as the reactor tells its schemes apart (schemeOf). */
const RENOWN_HASH_LENGTH = 44
const SHARED_HASH_LENGTH = 28

type LegacyScheme = 'legacy-renown' | 'legacy-shared' | 'legacy-unknown'

function legacySchemeOf(hash: string): LegacyScheme {
  if (hash.length === RENOWN_HASH_LENGTH) return 'legacy-renown'
  if (hash.length === SHARED_HASH_LENGTH) return 'legacy-shared'
  return 'legacy-unknown'
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/** The reactor's legacy-renown hash: SHA-256 of scope, type and JSON input, base64. */
async function renownLegacyHash(action: { scope: string; type: string; input: unknown }): Promise<string> {
  const payload = [action.scope, action.type, JSON.stringify(action.input)].join('')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return bytesToBase64(new Uint8Array(digest))
}

interface SignedAction {
  id: string
  type: string
  scope: string
  timestampUtcMs: string
  input: unknown
  signer: {
    user: { address: string; networkId: string; chainId: number }
    app: { name: string; key: string }
  }
  tuple: Tuple
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A signature as GraphQL transports it ("a, b, c, d, e") or as a tuple. */
function asTuple(value: unknown): Tuple | null {
  const parts = typeof value === 'string' ? value.split(', ') : value
  return Array.isArray(parts) && parts.length === 5 && parts.every((p) => typeof p === 'string') ? (parts as Tuple) : null
}

/** The signed action's fields, or why it cannot be checked. */
export function parseSignedAction(action: Record<string, unknown>): SignedAction | { problem: string } {
  const context = isRecord(action.context) ? action.context : {}
  const signer = isRecord(context.signer) ? context.signer : {}
  const user = isRecord(signer.user) ? signer.user : {}
  const app = isRecord(signer.app) ? signer.app : {}
  if (typeof app.key !== 'string' || !app.key) return { problem: 'It names no app key (context.signer.app.key).' }
  if (typeof user.address !== 'string' || !user.address) return { problem: 'It names no user (context.signer.user.address).' }
  const signatures = Array.isArray(signer.signatures) ? signer.signatures : []
  const tuple = asTuple(signatures.at(-1))
  if (!tuple) return { problem: signatures.length === 0 ? 'It carries no signature.' : 'Its signature is not five parts.' }
  if (typeof action.type !== 'string' || typeof action.id !== 'string') return { problem: 'It has no action id or type.' }
  return {
    id: action.id,
    type: action.type,
    scope: typeof action.scope === 'string' ? action.scope : 'global',
    timestampUtcMs: typeof action.timestampUtcMs === 'string' ? action.timestampUtcMs : String(action.timestampUtcMs ?? ''),
    input: action.input,
    signer: {
      user: {
        address: user.address,
        networkId: typeof user.networkId === 'string' ? user.networkId : '',
        chainId: typeof user.chainId === 'number' ? user.chainId : Number(user.chainId ?? 0),
      },
      app: { name: typeof app.name === 'string' ? app.name : '', key: app.key },
    },
    tuple,
  }
}

function verdictOf(checks: Check[], delegation: string): Verdict {
  if (checks.some((c) => ['shape', 'key', 'binding', 'signature'].includes(c.id) && c.status === 'fail')) return 'not-genuine'
  if (delegation === 'revoked') return 'revoked'
  if (delegation === 'expired') return 'expired'
  if (delegation === 'none') return 'not-genuine'
  if (checks.some((c) => c.status === 'unknown')) return 'unchecked'
  return 'genuine'
}

function malformed(problem: string): Report {
  return {
    kind: 'operation',
    verdict: 'not-genuine',
    summary: `This operation cannot be checked: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}`,
    checks: [{ id: 'shape', label: 'A signed operation', status: 'fail', detail: problem }],
    signer: null,
    app: null,
    times: [],
  }
}

type Shared = typeof import('@powerhousedao/shared/document-model')

/**
 * The legacy hash recomputed as the reactor does on its mutation path, and
 * compared with the one the signature covers. legacy-shared covers the content
 * and the document; legacy-renown the content only; neither covers the branch.
 */
async function legacyBinding(shared: Shared, action: SignedAction, scheme: LegacyScheme | null, documentId: string): Promise<Check> {
  const id = 'binding'
  const label = 'Matches what was signed'
  const hash = action.tuple[2]
  if (scheme === 'legacy-renown') {
    const expected = await renownLegacyHash(action)
    return expected === hash
      ? { id, label, status: 'pass', detail: 'A legacy signature over exactly this content. It does not cover which document or branch it belongs to.' }
      : { id, label, status: 'fail', detail: 'It does not match the legacy hash its signature covers: its content was changed after signing.' }
  }
  if (scheme === 'legacy-shared') {
    if (!documentId) {
      return { id, label, status: 'unknown', detail: 'A legacy signature that covers the document: enter the document id to check it.' }
    }
    let expected: string | null = null
    try {
      expected = shared.buildOperationSignatureParams({
        documentId,
        signer: { user: action.signer.user, app: action.signer.app, signatures: [] },
        action: { id: action.id, type: action.type, scope: action.scope, timestampUtcMs: action.timestampUtcMs, input: action.input },
        previousStateHash: '',
      } as Parameters<Shared['buildOperationSignatureParams']>[0])[2]
    } catch {
      expected = null
    }
    if (expected === null) {
      return { id, label, status: 'unknown', detail: 'Its legacy hash could not be recomputed from this content.' }
    }
    return expected === hash
      ? { id, label, status: 'pass', detail: `A legacy signature for document ${documentId} with exactly this content. It does not cover the branch.` }
      : {
          id,
          label,
          status: 'fail',
          detail: `It does not match the legacy hash its signature covers for document ${documentId}: its content was changed, or it was signed for another document.`,
        }
  }
  return { id, label, status: 'unknown', detail: `Its hash is of no known legacy kind (${hash.length} characters), so it cannot be recomputed.` }
}

export async function verifyOperation(
  raw: Record<string, unknown>,
  target: { documentId: string; branch: string },
  deps: VerifyDeps,
): Promise<Report> {
  const action = parseSignedAction(raw)
  if ('problem' in action) return malformed(action.problem)
  const shared = await import('@powerhousedao/shared/document-model')
  const [timestamp, key, hash, prevStateHash, signatureHex] = action.tuple
  const checks: Check[] = []
  const v2 = shared.isV2ActionHash(hash)
  const legacyScheme = v2 ? null : legacySchemeOf(hash)
  const documentId = target.documentId.trim()
  const branch = target.branch.trim() || 'main'

  if (key !== action.signer.app.key) {
    checks.push({ id: 'key', label: 'One app key throughout', status: 'fail', detail: 'The signature names a different key than the signer it claims.' })
  }
  if (v2) {
    const problem = shared.v2TupleProblem(action.tuple)
    if (problem) {
      checks.push({ id: 'shape', label: 'A well-formed v2 signature', status: 'fail', detail: `Its signature is malformed: ${problem}.` })
    } else if (!documentId) {
      checks.push({ id: 'binding', label: 'Bound to this document', status: 'unknown', detail: 'Enter the document id to check which document it was signed for.' })
    } else {
      let expected: string | null = null
      // A document-level action (CREATE_DOCUMENT, *_RELATIONSHIP, ...) is
      // signed for the document its input names, not the one it is sent to.
      const signedFor = shared.actionSigningTarget({ type: action.type, input: action.input }, documentId, branch)
      try {
        expected = await shared.hashActionV2(
          { id: action.id, type: action.type, scope: action.scope, timestampUtcMs: action.timestampUtcMs, input: action.input } as Parameters<typeof shared.hashActionV2>[0],
          signedFor,
          action.signer,
        )
      } catch {
        expected = null
      }
      const elsewhere =
        signedFor.documentId === documentId
          ? ''
          : ` A ${action.type} action is signed for the document its input names, so this is not the document you entered (${documentId}).`
      const label = elsewhere ? 'Bound to the document it names' : 'Bound to this document'
      checks.push(
        expected === hash
          ? {
              id: 'binding',
              label,
              status: 'pass',
              detail: `It was signed for document ${signedFor.documentId} on branch ${branch}, with exactly this content.${elsewhere}`,
            }
          : {
              id: 'binding',
              label,
              status: 'fail',
              detail: `It does not match what was signed for document ${signedFor.documentId} on branch ${branch}: its content was changed, or it was signed for another document or branch.`,
            },
      )
    }
  } else {
    checks.push(await legacyBinding(shared, action, legacyScheme, documentId))
  }

  const bytes = hexToBytes(signatureHex)
  const signed = bytes ? await verifyP256(key, bytes, shared.buildOperationSignatureMessage([timestamp, key, hash, prevStateHash])) : false
  checks.push(
    signed
      ? { id: 'signature', label: 'Signed by the app key', status: 'pass', detail: 'The app key the operation names made its P-256 signature.' }
      : { id: 'signature', label: 'Signed by the app key', status: 'fail', detail: 'The signature does not verify under the app key it names.' },
  )

  const signedAt = /^\d+$/.test(timestamp) ? new Date(Number(timestamp) * 1000) : null
  const user = action.signer.user.address.toLowerCase()
  const integrityFailed = checks.some((c) => ['shape', 'key', 'binding', 'signature'].includes(c.id) && c.status === 'fail')
  const delegation: Delegation = integrityFailed
    ? { outcome: 'none', credential: null, check: { id: 'delegation', label: 'Authorised by the user', status: 'neutral', detail: SKIPPED_DETAIL } }
    : signedAt
      ? await checkDelegation(deps.lookups, key, user, signedAt, 'signed')
      : { outcome: 'none', credential: null, check: { id: 'delegation', label: 'Authorised by the user', status: 'fail', detail: 'It carries no signing time to check the authorisation against.' } }
  checks.push(delegation.check)
  if (!integrityFailed && signedAt) {
    checks.push({
      id: 'timing',
      label: 'Signing time',
      status: 'neutral',
      detail: `It says it was signed on ${formatInstant(signedAt.toISOString())}. That time is the signer's own claim: expiry is judged at it, a revocation counts whenever it happened.`,
    })
  }

  const [signer, app] = await Promise.all([
    signerParty(deps.lookups, user, action.signer.user.chainId || null),
    // signer.app.name is not covered by any signature: only the authorising credential names the app.
    appParty(deps.lookups, key, delegation.credential?.credentialSubjectApp || null),
  ])
  const verdict = verdictOf(checks, delegation.outcome)
  const who = signerName(signer)
  const what = appName(app)
  const scope =
    legacyScheme === 'legacy-shared'
      ? ' (a legacy signature, which does not cover the branch)'
      : legacyScheme === 'legacy-renown'
        ? ' (a legacy signature, which does not cover the document or branch)'
        : ''
  const revokedAt = delegation.credential?.revokedAt
  const revokedOn = revokedAt && !Number.isNaN(Date.parse(revokedAt)) ? ` on ${formatDay(revokedAt)}` : ''
  const summary: Record<Verdict, string> = {
    // A legacy hash covers the content only, not the action id, time or user.
    genuine: `${who} made this ${action.type} through ${what}${scope}. ${legacyScheme ? 'Its content has' : 'It has'} not been changed since.`,
    'not-genuine': integrityFailed
      ? 'This operation was changed after it was signed, or its signature belongs to something else.'
      : signedAt
        ? `The operation is signed, but ${shortAddress(user)} had not authorised this app key at the signing time it states, so it does not show that they made it.`
        : `The operation is signed, but it carries no signing time, so it cannot show that ${shortAddress(user)} had authorised this app key when it was signed.`,
    revoked: `The credential behind this app key was revoked${revokedOn}. The signing time is the signer's own claim, so it cannot show the operation came before that.`,
    expired: `The credential that authorised this app key for ${who} had expired by the signing time the operation states.`,
    // verdictOf never gives these for an operation; the sentences stay true if it ever does.
    'not-yet-valid': `The credential that authorised this app key for ${who} was not valid yet at the signing time the operation states.`,
    'not-valid': `The dates of the credential that authorised this app key for ${who} cannot be read.`,
    unchecked:
      checks.find((c) => c.id === 'binding')?.status === 'unknown'
        ? legacyScheme === 'legacy-unknown'
          ? 'The signature holds, but it covers a legacy hash of a kind that cannot be recomputed, so it does not show what was signed.'
          : 'The signature holds. Enter the document id to check that it belongs to that document.'
        : 'The signature holds, but Renown could not be reached to confirm who authorised its key. Try again in a moment.',
    identity: '',
  }
  return {
    kind: 'operation',
    verdict,
    summary: sentence(summary[verdict]),
    checks,
    signer,
    app,
    times: [
      ...(signedAt ? [{ label: 'Signed', iso: signedAt.toISOString() }] : []),
      ...(Date.parse(action.timestampUtcMs)
        ? [{ label: legacyScheme ? 'Action time (not signed)' : 'Action time', iso: new Date(Date.parse(action.timestampUtcMs)).toISOString() }]
        : []),
    ],
  }
}
