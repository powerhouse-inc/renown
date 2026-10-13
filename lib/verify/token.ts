// /verify for a Renown bearer token (a JWT an app key signs for a user): is
// the app key's signature valid, is the token in date, and does a Renown
// credential of that user authorise the key right now? Pure apart from deps.
import { appName, formatInstant, sentence, shortAddress, signerName } from './format'
import { base64UrlToBytes, isP256DidKey, verifyP256 } from './p256'
import { orgRulesCheck, withOrgRules } from './org-rules'
import { appParty, checkDelegation, signerParty, SKEW_MS, type Delegation } from './parties'
import { SKIPPED_DETAIL, type Check, type Report, type Verdict, type VerifyDeps } from './types'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

interface TokenClaims {
  iss: string
  aud: string | undefined
  exp: number | undefined
  nbf: number | undefined
  iat: number | undefined
  address: string
  chainId: number | null
}

function decodePart(part: string): unknown {
  const bytes = base64UrlToBytes(part)
  if (!bytes) return null
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** The claims a Renown bearer token carries, or null when it is not one. */
export function readTokenClaims(jwt: string): TokenClaims | null {
  const [, payloadPart] = jwt.split('.')
  const payload = decodePart(payloadPart ?? '')
  if (!isRecord(payload) || typeof payload.iss !== 'string') return null
  const vc = isRecord(payload.vc) ? payload.vc : null
  const subject = vc && isRecord(vc.credentialSubject) ? vc.credentialSubject : null
  if (!subject || typeof subject.address !== 'string' || !ADDRESS_RE.test(subject.address)) return null
  return {
    iss: payload.iss,
    aud: typeof payload.aud === 'string' ? payload.aud : undefined,
    exp: num(payload.exp),
    nbf: num(payload.nbf),
    iat: num(payload.iat),
    address: subject.address.toLowerCase(),
    chainId: num(subject.chainId) ?? null,
  }
}

/**
 * The app key's ES256 signature over header.payload, checked offline. Renown
 * tokens are ES256 only, so any other alg (none, HS256, ...) is a forgery.
 * Null when the key is not P-256, which only the SDK can check.
 */
async function signatureByIssuer(jwt: string, iss: string): Promise<boolean | null> {
  const header = decodePart(jwt.split('.')[0])
  if (!isRecord(header) || header.alg !== 'ES256') return false
  if (!isP256DidKey(iss)) return null
  const [h, p, s] = jwt.split('.')
  const signature = base64UrlToBytes(s)
  if (!signature) return false
  return verifyP256(iss, signature, new TextEncoder().encode(`${h}.${p}`))
}

type Reason =
  | 'signature'
  | 'shape'
  | 'never-authorised'
  | 'not-yet'
  | 'revoked'
  | 'token-expired'
  | 'credential-expired'
  | 'unknown'
  | 'genuine'

/** The verdict and the check that decided it, so the summary names what actually failed. */
function decide(checks: Check[], expired: boolean, notYet: boolean, delegation: string): { verdict: Verdict; reason: Reason } {
  const failed = (id: string) => checks.some((c) => c.id === id && c.status === 'fail')
  if (failed('signature')) return { verdict: 'not-genuine', reason: 'signature' }
  if (failed('shape')) return { verdict: 'not-genuine', reason: 'shape' }
  if (delegation === 'none' && failed('delegation')) return { verdict: 'not-genuine', reason: 'never-authorised' }
  if (delegation === 'revoked') return { verdict: 'revoked', reason: 'revoked' }
  if (notYet && !expired) return { verdict: 'not-yet-valid', reason: 'not-yet' }
  if (expired) return { verdict: 'expired', reason: 'token-expired' }
  if (delegation === 'expired') return { verdict: 'expired', reason: 'credential-expired' }
  if (checks.some((c) => c.status === 'unknown')) return { verdict: 'unchecked', reason: 'unknown' }
  return { verdict: 'genuine', reason: 'genuine' }
}

export async function verifyToken(jwt: string, deps: VerifyDeps): Promise<Report> {
  const claims = readTokenClaims(jwt)
  if (!claims) {
    return {
      kind: 'token',
      verdict: 'not-genuine',
      summary: 'This token is not a Renown bearer token: it names no app key or no user address.',
      checks: [{ id: 'shape', label: 'A Renown bearer token', status: 'fail', detail: 'It has no did:key issuer or no address in its credential subject.' }],
      signer: null,
      app: null,
      times: [],
    }
  }
  const now = deps.now.getTime()
  const checks: Check[] = []
  const own = await signatureByIssuer(jwt, claims.iss)
  let sdk = false
  try {
    sdk = await deps.bearerToken(jwt, claims.aud)
  } catch {
    sdk = false
  }
  const expired = claims.exp !== undefined && claims.exp * 1000 <= now
  const notYet = claims.nbf !== undefined && claims.nbf * 1000 > now + SKEW_MS

  if (own === false || (own === null && !sdk && !expired)) {
    checks.push({ id: 'signature', label: 'Signed by the app key', status: 'fail', detail: 'The signature does not match the app key it names: the token was changed or forged.' })
  } else if (own === null && expired) {
    checks.push({ id: 'signature', label: 'Signed by the app key', status: 'unknown', detail: 'This key type can only be checked while the token is in date.' })
  } else {
    checks.push({ id: 'signature', label: 'Signed by the app key', status: 'pass', detail: 'The app key the token names made its signature.' })
    if (!sdk && !expired && !notYet) {
      checks.push({ id: 'shape', label: 'A Renown sign-in', status: 'fail', detail: 'The signature is valid, but the Renown token check refused its contents.' })
    }
  }
  if (checks[0].status === 'fail') {
    // Ruling 1: nothing else a forged token claims is checked.
    checks.push({ id: 'validity', label: 'In date', status: 'neutral', detail: SKIPPED_DETAIL })
  } else if (expired && claims.exp !== undefined) {
    checks.push({ id: 'validity', label: 'In date', status: 'fail', detail: `It expired on ${formatInstant(new Date(claims.exp * 1000).toISOString())}.` })
  } else if (notYet && claims.nbf !== undefined) {
    checks.push({ id: 'validity', label: 'In date', status: 'fail', detail: `It is not valid before ${formatInstant(new Date(claims.nbf * 1000).toISOString())}.` })
  } else {
    checks.push({
      id: 'validity',
      label: 'In date',
      status: 'pass',
      detail: claims.exp ? `Valid until ${formatInstant(new Date(claims.exp * 1000).toISOString())}.` : 'It has no expiry date; only the credential behind it limits it.',
    })
  }

  const forged = checks.some((c) => (c.id === 'signature' || c.id === 'shape') && c.status === 'fail')
  const delegation: Delegation = forged
    ? { outcome: 'none', credential: null, check: { id: 'delegation', label: 'Authorised by the user', status: 'neutral', detail: SKIPPED_DETAIL } }
    : await checkDelegation(deps.lookups, claims.iss, claims.address, deps.now, 'now')
  checks.push(delegation.check)
  if (claims.aud) {
    checks.push({ id: 'audience', label: 'Intended for', status: 'neutral', detail: `It is meant only for ${claims.aud}.` })
  }

  const [signer, app] = await Promise.all([
    signerParty(deps.lookups, claims.address, claims.chainId),
    // A token carries no app name; the credential that authorised its key does.
    appParty(deps.lookups, claims.iss, delegation.credential?.credentialSubjectApp || null, false, deps.orgs),
  ])
  const { verdict, reason } = decide(checks, expired, notYet, delegation.outcome)
  const who = signerName(signer)
  const what = appName(app)
  const signed = checks.some((c) => c.id === 'signature' && c.status === 'pass')
  const sentences: Record<Reason, string> = {
    signature: 'This token was changed or forged: its signature does not hold.',
    shape: 'The token is signed by the app key it names, but it is not a valid Renown sign-in token, so apps that use Renown refuse it.',
    'never-authorised': signed
      ? `The token is signed, but ${shortAddress(claims.address)} never authorised this app key, so it does not prove who is behind it.`
      : `The token names ${shortAddress(claims.address)}, but ${shortAddress(claims.address)} never authorised this app key, so it does not prove who is behind it.`,
    'not-yet': `This token is not valid before ${claims.nbf !== undefined ? formatInstant(new Date(claims.nbf * 1000).toISOString()) : 'its start time'}, so apps must refuse it until then.`,
    revoked: `${who} revoked the credential that authorised this app key, so the token no longer speaks for them.`,
    'token-expired': 'This token has expired. Apps must refuse it.',
    'credential-expired': `The credential that authorised this app key for ${who} has expired.`,
    unknown: 'The token is signed and in date, but Renown could not be reached to confirm who authorised its key. Try again in a moment.',
    genuine: `${what} signed this token for ${who}, who authorised that app. ${claims.exp ? 'It is in date.' : 'It does not expire.'}`,
  }
  const times = [
    ...(claims.iat ?? claims.nbf ? [{ label: 'Issued', iso: new Date((claims.iat ?? claims.nbf ?? 0) * 1000).toISOString() }] : []),
    ...(claims.exp ? [{ label: 'Expires', iso: new Date(claims.exp * 1000).toISOString() }] : []),
  ]
  const report: Report = { kind: 'token', verdict, summary: sentence(sentences[reason]), checks, signer, app, times }
  if (delegation.outcome !== 'authorised' || !delegation.credential) return report
  return withOrgRules(report, await orgRulesCheck(deps.orgs, delegation.credential.credentialId, claims.address, app.publisherOrg?.name ?? null))
}
