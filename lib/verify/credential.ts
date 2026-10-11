// /verify for a Renown delegation credential (pasted JSON, or looked up by its
// urn:uuid id): is its EIP-712 proof the issuer's, is it in date, and has the
// issuer revoked it? Pure apart from the injected deps.
import { appName, formatDay, formatInstant, sentence, shortAddress, signerName } from './format'
import { appParty, signerParty, SKEW_MS } from './parties'
import type {
  Check,
  CredentialForSignature,
  Report,
  StoredCredential,
  StoredCredentialFull,
  Verdict,
  VerifyDeps,
} from './types'
import { SKIPPED_DETAIL } from './types'

const PKH_RE = /^did:pkh:eip155:(\d{1,12}):(0x[0-9a-fA-F]{40})$/
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/** The EIP-712 types every Renown credential is signed with (@renown/sdk CREDENTIAL_TYPES, minus the domain). */
const CREDENTIAL_EIP712_TYPES = {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function strings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === 'string') ? (value as string[]) : null
}

/**
 * The credential reduced to what its signature covers, or the first field
 * that is missing or malformed.
 */
export function parseCredential(raw: Record<string, unknown>): { credential: CredentialForSignature } | { missing: string } {
  const issuer = isRecord(raw.issuer) ? raw.issuer : {}
  const subject = isRecord(raw.credentialSubject) ? raw.credentialSubject : {}
  const schema = isRecord(raw.credentialSchema) ? raw.credentialSchema : {}
  const proof = isRecord(raw.proof) ? raw.proof : {}
  const eip712 = isRecord(proof.eip712) ? proof.eip712 : {}
  const domain = isRecord(eip712.domain) ? eip712.domain : {}
  const chainId = typeof domain.chainId === 'number' ? domain.chainId : Number(domain.chainId)
  const fields: [string, unknown][] = [
    ['@context', strings(raw['@context'])],
    ['type', strings(raw.type)],
    ['id', str(raw.id)],
    ['issuer.id', str(issuer.id)],
    ['issuer.ethereumAddress', str(issuer.ethereumAddress) && ADDRESS_RE.test(String(issuer.ethereumAddress))],
    ['credentialSubject.id', str(subject.id)],
    ['credentialSubject.app', typeof subject.app === 'string' ? true : null],
    ['credentialSchema', str(schema.id) && str(schema.type)],
    ['issuanceDate', str(raw.issuanceDate)],
    ['expirationDate', str(raw.expirationDate)],
    ['proof.proofValue', str(proof.proofValue) && /^0x[0-9a-fA-F]+$/.test(String(proof.proofValue))],
    ['proof.eip712.domain', str(domain.version) && Number.isInteger(chainId) && chainId > 0],
  ]
  const missing = fields.find(([, value]) => !value)
  if (missing) return { missing: missing[0] }
  const issuerAddress = String(issuer.ethereumAddress) as `0x${string}`
  return {
    credential: {
      '@context': raw['@context'] as string[],
      type: raw.type as string[],
      id: String(raw.id),
      issuer: { id: String(issuer.id), ethereumAddress: issuerAddress },
      credentialSubject: { id: String(subject.id), app: String(subject.app) },
      credentialSchema: { id: String(schema.id), type: String(schema.type) },
      issuanceDate: String(raw.issuanceDate),
      expirationDate: String(raw.expirationDate),
      proof: {
        type: str(proof.type) ?? 'EthereumEip712Signature2021',
        created: str(proof.created) ?? String(raw.issuanceDate),
        verificationMethod: str(proof.verificationMethod) ?? String(issuer.id),
        proofPurpose: str(proof.proofPurpose) ?? 'assertionMethod',
        proofValue: String(proof.proofValue),
        ethereumAddress: (str(proof.ethereumAddress) ?? issuerAddress) as `0x${string}`,
        eip712: { domain: { version: String(domain.version), chainId }, primaryType: 'VerifiableCredential' },
      },
    },
  }
}

/** A stored credential (renownCredentials) as the credential its issuer signed. */
export function credentialFromStored(row: StoredCredentialFull): CredentialForSignature | null {
  let domain: { version?: unknown; chainId?: unknown }
  try {
    domain = JSON.parse(row.proofEip712Domain) as { version?: unknown; chainId?: unknown }
  } catch {
    return null
  }
  const parsed = parseCredential({
    '@context': row.context,
    type: row.type,
    id: row.credentialId,
    issuer: { id: row.issuerId, ethereumAddress: row.issuerEthereumAddress },
    credentialSubject: { id: row.credentialSubjectId, app: row.credentialSubjectApp },
    credentialSchema: { id: row.credentialSchemaId, type: row.credentialSchemaType },
    issuanceDate: row.issuanceDate,
    expirationDate: row.expirationDate,
    proof: {
      proofValue: row.proofValue,
      ethereumAddress: row.proofEthereumAddress,
      eip712: { domain },
    },
  })
  return 'credential' in parsed ? parsed.credential : null
}

/** The issuer DID, issuer address and proof address must name one wallet, on the domain's chain. */
function bindingProblem(credential: CredentialForSignature): string | null {
  const pkh = PKH_RE.exec(credential.issuer.id)
  if (!pkh) return 'The issuer is not a did:pkh wallet identity.'
  const address = credential.issuer.ethereumAddress.toLowerCase()
  if (pkh[2].toLowerCase() !== address) return 'The issuer DID and the issuer address name different wallets.'
  if (credential.proof.ethereumAddress.toLowerCase() !== address) return 'The proof names a different wallet than the issuer.'
  if (Number(pkh[1]) !== credential.proof.eip712.domain.chainId) return 'The issuer DID and the signature are for different chains.'
  return null
}

type SignatureOutcome = 'eoa' | 'contract' | 'invalid' | 'unavailable'

async function checkSignature(credential: CredentialForSignature, deps: VerifyDeps): Promise<SignatureOutcome> {
  let valid = false
  try {
    valid = await deps.eoaSignature(credential)
  } catch {
    valid = false
  }
  if (valid) return 'eoa'
  const { proof, ...message } = credential
  const onChain = await deps.contractSignature({
    chainId: proof.eip712.domain.chainId,
    address: credential.issuer.ethereumAddress,
    signature: proof.proofValue,
    typedData: { domain: proof.eip712.domain, types: CREDENTIAL_EIP712_TYPES, primaryType: 'VerifiableCredential', message },
  })
  if (onChain === 'valid') return 'contract'
  if (onChain === 'unavailable') return 'unavailable'
  return 'invalid'
}

function verdictOf(checks: Check[], notInDate: 'unreadable' | 'future' | 'expired' | null): Verdict {
  const byId = (id: string) => checks.find((c) => c.id === id)
  if (checks.some((c) => (c.id === 'signature' || c.id === 'shape') && c.status === 'fail')) return 'not-genuine'
  if (byId('revocation')?.status === 'fail') return 'revoked'
  if (byId('validity')?.status === 'fail') return notInDate === 'future' ? 'not-yet-valid' : notInDate === 'unreadable' ? 'not-valid' : 'expired'
  if (checks.some((c) => c.status === 'unknown')) return 'unchecked'
  return 'genuine'
}

function revocationCheck(rows: StoredCredential[] | null, issuer: string): Check {
  const id = 'revocation'
  const label = 'Not revoked'
  if (rows === null) {
    return { id, label, status: 'unknown', detail: 'Renown could not be reached to check whether it was revoked.' }
  }
  const own = rows.find((r) => r.issuerEthereumAddress.toLowerCase() === issuer.toLowerCase())
  if (!own) {
    return {
      id,
      label,
      status: 'neutral',
      detail: 'Renown has no record of this credential, so it cannot have been revoked through Renown. Apps that rely on Renown do not accept it until it is stored.',
    }
  }
  if (own.revoked) {
    const when = own.revokedAt ? ` on ${formatDay(own.revokedAt)}` : ''
    return { id, label, status: 'fail', detail: `The issuer revoked it${when}.` }
  }
  return { id, label, status: 'pass', detail: 'Renown has it on record and the issuer has not revoked it.' }
}

/** Checks a parsed credential; `stored` is the registry answer when it is already known (id lookups). */
export async function verifyCredential(
  raw: Record<string, unknown>,
  deps: VerifyDeps,
  stored?: StoredCredentialFull[],
): Promise<Report> {
  const parsed = parseCredential(raw)
  if ('missing' in parsed) {
    return {
      kind: 'credential',
      verdict: 'not-genuine',
      summary: `This is not a complete Renown credential: ${parsed.missing} is missing or malformed.`,
      checks: [{ id: 'shape', label: 'A complete Renown credential', status: 'fail', detail: `${parsed.missing} is missing or malformed.` }],
      signer: null,
      app: null,
      times: [],
    }
  }
  const credential = parsed.credential
  const issuer = credential.issuer.ethereumAddress.toLowerCase()
  const chainId = credential.proof.eip712.domain.chainId
  const checks: Check[] = []

  const binding = bindingProblem(credential)
  if (binding) {
    checks.push({ id: 'signature', label: 'Signed by the issuer', status: 'fail', detail: binding })
  } else {
    const outcome = await checkSignature(credential, deps)
    checks.push(
      outcome === 'eoa'
        ? { id: 'signature', label: 'Signed by the issuer', status: 'pass', detail: `The EIP-712 signature was made by ${shortAddress(issuer)}.` }
        : outcome === 'contract'
          ? { id: 'signature', label: 'Signed by the issuer', status: 'pass', detail: `The smart wallet ${shortAddress(issuer)} confirmed the signature on chain ${chainId}.` }
          : outcome === 'unavailable'
            ? { id: 'signature', label: 'Signed by the issuer', status: 'unknown', detail: `The signature is not from a plain wallet, and chain ${chainId} could not be asked whether ${shortAddress(issuer)} is a smart wallet that made it.` }
            : stored
              ? // A copy that went through the database (dates stored at another
                // precision) may not reproduce the signed bytes: not evidence of forgery.
                { id: 'signature', label: 'Signed by the issuer', status: 'unknown', detail: 'The stored copy does not reproduce the signed bytes exactly, so its signature could not be re-checked. Paste the full credential to check it.' }
              : { id: 'signature', label: 'Signed by the issuer', status: 'fail', detail: `The signature was not made by ${shortAddress(issuer)}: the credential was changed after signing, or someone else signed it.` },
    )
  }

  const forged = checks[0].status === 'fail'
  const now = deps.now.getTime()
  const issued = Date.parse(credential.issuanceDate)
  const expires = Date.parse(credential.expirationDate)
  let notInDate: 'unreadable' | 'future' | 'expired' | null = null
  if (forged) {
    checks.push({ id: 'validity', label: 'In date', status: 'neutral', detail: SKIPPED_DETAIL })
  } else if (Number.isNaN(issued) || Number.isNaN(expires)) {
    notInDate = 'unreadable'
    checks.push({ id: 'validity', label: 'In date', status: 'fail', detail: 'Its issue or expiry date is not a date.' })
  } else if (issued > now + SKEW_MS) {
    notInDate = 'future'
    checks.push({ id: 'validity', label: 'In date', status: 'fail', detail: `It is dated in the future (${formatInstant(credential.issuanceDate)}).` })
  } else if (expires <= now) {
    notInDate = 'expired'
    checks.push({ id: 'validity', label: 'In date', status: 'fail', detail: `It expired on ${formatInstant(credential.expirationDate)}.` })
  } else {
    checks.push({ id: 'validity', label: 'In date', status: 'pass', detail: `Valid until ${formatInstant(credential.expirationDate)}.` })
  }

  let rows: StoredCredential[] | null = stored ?? null
  if (forged) {
    checks.push({ id: 'revocation', label: 'Not revoked', status: 'neutral', detail: SKIPPED_DETAIL })
  } else {
    if (!stored) {
      const found = await deps.lookups.credentialById(credential.id)
      rows = found.ok ? found.value : null
    }
    checks.push(revocationCheck(rows, issuer))
  }

  const session = credential.credentialSubject.id === credential.issuer.id || !credential.credentialSubject.id.startsWith('did:key:')
  const [signer, app] = await Promise.all([
    signerParty(deps.lookups, issuer, chainId),
    appParty(deps.lookups, credential.credentialSubject.id, credential.credentialSubject.app || null, session),
  ])
  checks.push(
    session
      ? { id: 'subject', label: 'What it authorises', status: 'neutral', detail: 'A CLI or other session signed in as this wallet, not an app with its own key.' }
      : {
          id: 'subject',
          label: 'What it authorises',
          status: 'neutral',
          detail: app.profile
            ? `The app key of ${appName(app)}, which has a public app profile.`
            : `The app key ${credential.credentialSubject.id.slice(0, 16)}…, which has no public app profile${app.claimedName ? ` (it calls itself ${app.claimedName})` : ''}.`,
        },
  )

  const verdict = verdictOf(checks, notInDate)
  const who = signerName(signer)
  const what = appName(app)
  // When the signature could not be checked, nothing may say the wallet signed it.
  const signatureUnknown = checks[0].status === 'unknown'
  const signedBy = signatureUnknown
    ? `This credential claims to be signed by ${who} for ${what}, but its signature could not be checked`
    : `${who} signed this credential for ${what}`
  const dateProblem =
    notInDate === 'future'
      ? 'it is dated in the future, so it is not valid yet'
      : notInDate === 'unreadable'
        ? 'its dates cannot be read'
        : 'it is no longer in date'
  const summary: Record<Verdict, string> = {
    genuine:
      checks.find((c) => c.id === 'revocation')?.status === 'pass'
        ? `${who} signed this credential for ${what}. It is in date and has not been revoked.`
        : `${who} signed this credential for ${what} and it is in date. Renown has no record of it.`,
    'not-genuine': `This credential was not signed by the wallet it names, so it proves nothing about ${shortAddress(issuer)}.`,
    revoked: signatureUnknown
      ? `${signedBy}. The issuer has revoked it, so it no longer authorises anything.`
      : `${signedBy}, then revoked it. It no longer authorises anything.`,
    expired: signatureUnknown ? `${signedBy}, and ${dateProblem}.` : `${signedBy}, but ${dateProblem}.`,
    'not-yet-valid': signatureUnknown ? `${signedBy}, and ${dateProblem}.` : `${signedBy}, but ${dateProblem}.`,
    'not-valid': signatureUnknown ? `${signedBy}, and ${dateProblem}.` : `${signedBy}, but ${dateProblem}.`,
    unchecked: !signatureUnknown
      ? 'Part of this credential could not be checked just now. Nothing below says it is forged; try again in a moment.'
      : stored
        ? 'Renown has this credential, but its signature could not be re-checked from the stored copy. Paste the full credential to check it.'
        : `${signedBy}: it is not from a plain wallet, and chain ${chainId} could not be asked whether a smart wallet at ${shortAddress(issuer)} made it.`,
    identity: '',
  }
  const revokedAt = rows?.find((r) => r.revoked && r.revokedAt && r.issuerEthereumAddress.toLowerCase() === issuer)?.revokedAt
  const times = [
    { label: 'Issued', iso: credential.issuanceDate },
    { label: 'Expires', iso: credential.expirationDate },
    ...(revokedAt ? [{ label: 'Revoked', iso: revokedAt }] : []),
  ]
  return { kind: 'credential', verdict, summary: sentence(summary[verdict]), checks, signer, app, times }
}

/** /verify for a credential id: the stored copy, re-checked like a pasted credential. */
export async function verifyCredentialId(credentialId: string, deps: VerifyDeps): Promise<Report> {
  const found = await deps.lookups.credentialById(credentialId)
  if (!found.ok) {
    return {
      kind: 'credential-id',
      verdict: 'unchecked',
      summary: 'Renown could not be reached to look up this credential. Try again in a moment.',
      checks: [{ id: 'registry', label: 'Known to Renown', status: 'unknown', detail: 'The lookup failed.' }],
      signer: null,
      app: null,
      times: [],
    }
  }
  const row = found.value[0]
  if (!row) {
    return {
      kind: 'credential-id',
      verdict: 'not-genuine',
      summary: 'Renown has no credential with this id, so nothing vouches for it.',
      checks: [{ id: 'registry', label: 'Known to Renown', status: 'fail', detail: 'No stored credential has this id.' }],
      signer: null,
      app: null,
      times: [],
    }
  }
  const credential = credentialFromStored(row)
  if (!credential) {
    return {
      kind: 'credential-id',
      verdict: 'unchecked',
      summary: 'Renown has this credential, but its stored copy could not be read back. Paste the full credential to check it.',
      checks: [{ id: 'registry', label: 'Known to Renown', status: 'pass', detail: 'A stored credential has this id.' }],
      signer: null,
      app: null,
      times: [],
    }
  }
  const report = await verifyCredential(credential as unknown as Record<string, unknown>, deps, found.value)
  return { ...report, kind: 'credential-id' }
}
