// /verify for a release attestation (renown-package A2 ruling 14): did the
// named wallet sign this EIP-712 sign-off, does Renown hold it, and does the
// organisation it names publish the app? viem loads only when one is checked.
// The constants are the SDK's (renown-package sdk/orgs.ts), copied verbatim.
import { appName, formatInstant, formatDay, sentence, shortAddress, signerName } from './format'
import { appParty, signerParty } from './parties'
import type { Check, Lookup, Report, StoredAttestation, Verdict, VerifyDeps } from './types'
import { SKIPPED_DETAIL } from './types'

export const RELEASE_DOMAIN = { name: 'Renown Release', version: '1', chainId: 1 } as const
export const RELEASE_TYPES = {
  ReleaseAttestation: [
    { name: 'appDid', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'artifactDigest', type: 'string' },
    { name: 'orgId', type: 'string' },
    { name: 'issuedAt', type: 'string' },
  ],
} as const

/** renown-orgs accepts issuedAt at most this far ahead of the time it records the attestation… */
export const ATTESTATION_FUTURE_SKEW_MS = 5 * 60_000
/** …and at most this old. */
export const ATTESTATION_MAX_AGE_MS = 30 * 86_400_000

export interface ReleaseAttestationInput {
  appDid: string
  version: string
  artifactDigest: string
  orgId: string
  /** Exactly as signed: never normalised, or the typed-data hash changes. */
  issuedAt: string
  signer: `0x${string}`
  signature: `0x${string}`
}

const APP_DID_RE = /^did:key:z[1-9A-HJ-NP-Za-km-z]{32,128}$/
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const HEX_RE = /^0x[0-9a-fA-F]+$/
/** An ISO-8601 time that names its zone, as renown-orgs requires. */
const ZONED_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const FIELDS = ['appDid', 'version', 'artifactDigest', 'orgId', 'issuedAt', 'signer', 'signature'] as const

/** JSON that carries every signed field of an attestation (extra fields such as `id` are fine). */
export function isAttestationShape(value: Record<string, unknown>): boolean {
  return FIELDS.every((field) => typeof value[field] === 'string')
}

export function parseAttestation(raw: Record<string, unknown>): { attestation: ReleaseAttestationInput } | { missing: string } {
  const text = (field: string) => (typeof raw[field] === 'string' ? (raw[field] as string) : null)
  const checks: [string, boolean][] = [
    ['appDid', APP_DID_RE.test(text('appDid') ?? '')],
    ['version', Boolean(text('version')?.trim())],
    ['artifactDigest', DIGEST_RE.test(text('artifactDigest') ?? '')],
    ['orgId', text('orgId') !== null],
    ['issuedAt', !Number.isNaN(Date.parse(text('issuedAt') ?? ''))],
    ['signer', ADDRESS_RE.test(text('signer') ?? '')],
    ['signature', HEX_RE.test(text('signature') ?? '')],
  ]
  const missing = checks.find(([, ok]) => !ok)
  if (missing) return { missing: missing[0] }
  return {
    attestation: {
      appDid: text('appDid') ?? '',
      version: text('version') ?? '',
      artifactDigest: text('artifactDigest') ?? '',
      orgId: text('orgId') ?? '',
      issuedAt: text('issuedAt') ?? '',
      signer: (text('signer') ?? '') as `0x${string}`,
      signature: (text('signature') ?? '') as `0x${string}`,
    },
  }
}

type SignatureOutcome = 'eoa' | 'contract' | 'invalid' | 'unavailable'

async function checkSignature(a: ReleaseAttestationInput, deps: VerifyDeps): Promise<SignatureOutcome> {
  const message = { appDid: a.appDid, version: a.version, artifactDigest: a.artifactDigest, orgId: a.orgId, issuedAt: a.issuedAt }
  try {
    const { recoverTypedDataAddress } = await import('viem')
    const recovered = await recoverTypedDataAddress({ domain: RELEASE_DOMAIN, types: RELEASE_TYPES, primaryType: 'ReleaseAttestation', message, signature: a.signature })
    if (recovered.toLowerCase() === a.signer.toLowerCase()) return 'eoa'
  } catch {
    // Not a plain 65-byte signature: the chain may still know it.
  }
  const onChain = await deps.contractSignature({
    chainId: 1,
    address: a.signer,
    signature: a.signature,
    typedData: { domain: RELEASE_DOMAIN, types: RELEASE_TYPES, primaryType: 'ReleaseAttestation', message },
  })
  return onChain === 'valid' ? 'contract' : onChain === 'unavailable' ? 'unavailable' : 'invalid'
}

function sameAttestation(stored: StoredAttestation, a: ReleaseAttestationInput): boolean {
  return stored.signature.toLowerCase() === a.signature.toLowerCase() && stored.signer.toLowerCase() === a.signer.toLowerCase()
}

interface RecordLookup {
  found: Lookup<StoredAttestation | null>
  /** The paste named an id that Renown holds for a different attestation. */
  idMismatch: boolean
}

/**
 * Renown's record of the attestation: by the id the paste carries first
 * (releaseAttestation), then among the app's newest 50 (releaseAttestations).
 */
async function findRecord(raw: Record<string, unknown>, a: ReleaseAttestationInput, deps: VerifyDeps): Promise<RecordLookup | null> {
  const orgs = deps.orgs
  if (!orgs) return null
  let idMismatch = false
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (id) {
    const byId = await orgs.releaseAttestation(id)
    if (byId.ok && byId.value && sameAttestation(byId.value, a)) return { found: { ok: true, value: byId.value }, idMismatch }
    idMismatch = byId.ok && byId.value !== null
  }
  const page = await orgs.releaseAttestations(a.appDid)
  if (!page.ok) return { found: page, idMismatch }
  return { found: { ok: true, value: page.value.find((r) => sameAttestation(r, a)) ?? null }, idMismatch }
}

/** renown-orgs' issuedAt rule, judged at the time it recorded the attestation (or now, for an unrecorded one). */
function issuedAtCheck(a: ReleaseAttestationInput, record: StoredAttestation | null, now: Date): Check {
  const id = 'issued-at'
  const label = 'Signed-off time'
  const issued = Date.parse(a.issuedAt)
  const at = record ? Date.parse(record.createdAt) : now.getTime()
  const when = `It was signed off on ${formatInstant(a.issuedAt)}`
  if (!ZONED_RE.test(a.issuedAt)) {
    return { id, label, status: 'neutral', detail: `${when}, but the time names no zone, so Renown would not record it.` }
  }
  const inWindow = issued <= at + ATTESTATION_FUTURE_SKEW_MS && issued >= at - ATTESTATION_MAX_AGE_MS
  if (record) {
    return inWindow
      ? { id, label, status: 'pass', detail: `${when}, within the window Renown accepts (at most 5 minutes ahead, at most 30 days old when recorded).` }
      : { id, label, status: 'neutral', detail: `${when}, outside the window Renown accepts (at most 5 minutes ahead, at most 30 days old when recorded).` }
  }
  if (inWindow) return { id, label, status: 'pass', detail: `${when}; Renown would still accept it (at most 5 minutes ahead, at most 30 days old).` }
  return {
    id,
    label,
    status: 'neutral',
    detail: `${when}; Renown accepts attestations at most 5 minutes ahead and at most 30 days old, so it would not record this one now.`,
  }
}

export async function verifyAttestation(raw: Record<string, unknown>, deps: VerifyDeps): Promise<Report> {
  const parsed = parseAttestation(raw)
  if ('missing' in parsed) {
    return {
      kind: 'release-attestation',
      verdict: 'not-genuine',
      summary: `This is not a complete release attestation: ${parsed.missing} is missing or malformed.`,
      checks: [{ id: 'shape', label: 'A complete release attestation', status: 'fail', detail: `${parsed.missing} is missing or malformed.` }],
      signer: null,
      app: null,
      times: [],
    }
  }
  const a = parsed.attestation
  const signer = a.signer.toLowerCase()
  const label = 'Signed by the named wallet'
  const outcome = await checkSignature(a, deps)
  const checks: Check[] = [
    outcome === 'eoa'
      ? { id: 'signature', label, status: 'pass', detail: `The EIP-712 signature was made by ${shortAddress(signer)}.` }
      : outcome === 'contract'
        ? { id: 'signature', label, status: 'pass', detail: `The smart wallet ${shortAddress(signer)} confirmed the signature on chain 1.` }
        : outcome === 'unavailable'
          ? { id: 'signature', label, status: 'unknown', detail: `The signature is not from a plain wallet, and chain 1 could not be asked whether ${shortAddress(signer)} is a smart wallet that made it.` }
          : { id: 'signature', label, status: 'fail', detail: `The signature was not made by ${shortAddress(signer)}: the attestation was changed after signing, or someone else signed it.` },
  ]
  const forged = outcome === 'invalid'
  const [party, app, recorded] = await Promise.all([
    signerParty(deps.lookups, signer, 1),
    appParty(deps.lookups, a.appDid, null, false, deps.orgs),
    forged ? Promise.resolve(null) : findRecord(raw, a, deps),
  ])

  let record: StoredAttestation | null = null
  const recordLabel = 'Recorded by Renown'
  if (forged) checks.push({ id: 'record', label: recordLabel, status: 'neutral', detail: SKIPPED_DETAIL })
  else if (!recorded) checks.push({ id: 'record', label: recordLabel, status: 'neutral', detail: 'Renown’s record of attestations was not consulted.' })
  else if (!recorded.found.ok) checks.push({ id: 'record', label: recordLabel, status: 'unknown', detail: 'Renown could not be reached to look up its record of this attestation.' })
  else {
    record = recorded.found.value
    const otherId = recorded.idMismatch ? ' The id it carries belongs to a different attestation.' : ''
    checks.push(
      record
        ? {
            id: 'record',
            label: recordLabel,
            status: 'pass',
            detail: `Renown recorded it on ${formatDay(record.createdAt)}${record.signerRole ? `, when the signer was ${record.signerRole.toLowerCase()} of the organisation` : ''}.${record.signerStillMember ? '' : ' The signer is no longer a member.'}${otherId}`,
          }
        : { id: 'record', label: recordLabel, status: 'neutral', detail: `Renown has no record of this attestation. Apps that check Renown trust only recorded ones.${otherId}` },
    )
  }

  checks.push(forged ? { id: 'issued-at', label: 'Signed-off time', status: 'neutral', detail: SKIPPED_DETAIL } : issuedAtCheck(a, record, deps.now))

  // undefined: the publisher could not be looked up; null: no organisation publishes the app.
  const org = app.publisherOrg
  const publisherLabel = 'Published by'
  if (forged) checks.push({ id: 'publisher', label: publisherLabel, status: 'neutral', detail: SKIPPED_DETAIL })
  else if (a.orgId === '') checks.push({ id: 'publisher', label: publisherLabel, status: 'neutral', detail: 'It was signed for an app a person publishes.' })
  else if (org && org.id === a.orgId) {
    checks.push({ id: 'publisher', label: publisherLabel, status: 'pass', detail: `${org.name} publishes this app${org.verifiedDomains.length ? `, verified as ${org.verifiedDomains[0]}` : ''}.` })
  } else if (deps.orgs && org === undefined) {
    checks.push({ id: 'publisher', label: publisherLabel, status: 'unknown', detail: 'Renown could not be reached to look up the organisation that publishes this app.' })
  } else checks.push({ id: 'publisher', label: publisherLabel, status: 'neutral', detail: 'It names an organisation that does not publish this app now.' })

  const verdict: Verdict = forged ? 'not-genuine' : checks.some((c) => c.status === 'unknown') ? 'unchecked' : 'genuine'
  const who = signerName(party)
  const what = appName(app)
  const publishedBy = a.orgId !== '' && org && org.id === a.orgId ? `published by ${org.name}, ` : ''
  const summary =
    verdict === 'genuine'
      ? `Release ${a.version} of ${what} — ${publishedBy}signed off by ${who}.${record ? '' : ' Renown has no record of it.'}`
      : verdict === 'not-genuine'
        ? `This attestation was not signed by the wallet it names, so it proves nothing about release ${a.version}.`
        : outcome === 'unavailable'
          ? `It is not from a plain wallet, and chain 1 could not be asked whether a smart wallet at ${shortAddress(signer)} made it.`
          : `${who} signed off release ${a.version} of ${what}, but Renown could not be reached to check its record. Try again in a moment.`
  return {
    kind: 'release-attestation',
    verdict,
    summary: sentence(summary),
    checks,
    signer: party,
    app,
    times: [{ label: 'Signed off', iso: a.issuedAt }, ...(record ? [{ label: 'Recorded', iso: record.createdAt }] : [])],
  }
}
