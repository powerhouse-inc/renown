// /verify for a signed document operation: does the v2 hash bind this action
// to the given document and branch, is the P-256 signature the app key's, and
// did the user authorise that key when it signed? Mirrors the reactor's
// verifyActionSignature (integrity) plus the Renown trust lookup (identity).
// @powerhousedao/shared is loaded only when an operation is checked.
import { appName, sentence, shortAddress, signerName } from './format'
import { hexToBytes, verifyP256 } from './p256'
import { appParty, checkDelegation, signerParty, type Delegation } from './parties'
import { SKIPPED_DETAIL, type Check, type Report, type Verdict, type VerifyDeps } from './types'

type Tuple = [string, string, string, string, string]

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
      try {
        const signedFor = shared.actionSigningTarget({ type: action.type, input: action.input }, documentId, branch)
        expected = await shared.hashActionV2(
          { id: action.id, type: action.type, scope: action.scope, timestampUtcMs: action.timestampUtcMs, input: action.input } as Parameters<typeof shared.hashActionV2>[0],
          signedFor,
          action.signer,
        )
      } catch {
        expected = null
      }
      checks.push(
        expected === hash
          ? { id: 'binding', label: 'Bound to this document', status: 'pass', detail: `It was signed for document ${documentId} on branch ${branch}, with exactly this content.` }
          : {
              id: 'binding',
              label: 'Bound to this document',
              status: 'fail',
              detail: `It does not match what was signed for document ${documentId} on branch ${branch}: its content was changed, or it was signed for another document or branch.`,
            },
      )
    }
  } else {
    checks.push({
      id: 'binding',
      label: 'Bound to this document',
      status: 'neutral',
      detail: 'A legacy signature: it covers the content, but not which document or branch it belongs to.',
    })
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

  const [signer, app] = await Promise.all([
    signerParty(deps.lookups, user, action.signer.user.chainId || null),
    appParty(deps.lookups, key, action.signer.app.name || delegation.credential?.credentialSubjectApp || null),
  ])
  const verdict = verdictOf(checks, delegation.outcome)
  const who = signerName(signer)
  const what = appName(app)
  const scope = v2 ? '' : ' (a legacy signature, which does not cover the document it belongs to)'
  const summary: Record<Verdict, string> = {
    genuine: `${who} made this ${action.type} through ${what}${scope}. It has not been changed since.`,
    'not-genuine': integrityFailed
      ? 'This operation was changed after it was signed, or its signature belongs to something else.'
      : `The operation is signed, but ${shortAddress(user)} had not authorised this app key when it was signed, so it does not show that they made it.`,
    revoked: `${who} had revoked the credential for this app key before it was signed.`,
    expired: `The credential that authorised this app key for ${who} had expired before it was signed.`,
    unchecked: integrityFailed
      ? ''
      : documentId || !v2
        ? 'The signature holds, but Renown could not be reached to confirm who authorised its key. Try again in a moment.'
        : 'The signature holds. Enter the document id to check that it belongs to that document.',
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
      ...(Date.parse(action.timestampUtcMs) ? [{ label: 'Action time', iso: new Date(Date.parse(action.timestampUtcMs)).toISOString() }] : []),
    ],
  }
}
