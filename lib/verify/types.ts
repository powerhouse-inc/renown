// The shapes /verify passes around: what was pasted, each check made, and the
// report the page renders. Pure types.

export type InputKind = 'did-pkh' | 'did-key' | 'credential' | 'token' | 'credential-id' | 'operation'

/** pass/fail: checked; neutral: does not apply or says nothing either way; unknown: a lookup failed. */
export type CheckStatus = 'pass' | 'fail' | 'neutral' | 'unknown'

/** What a check says when an earlier one already showed the signature does not hold. */
export const SKIPPED_DETAIL = 'Not checked: the signature does not hold, so nothing else it claims can be trusted.'

export interface Check {
  id: string
  label: string
  status: CheckStatus
  /** One plain sentence about what was found. */
  detail: string
}

/**
 * The banner. 'identity' is the DID report: a DID is a name, not a signed claim.
 * 'not-yet-valid': genuinely signed, but its validity starts in the future.
 * 'not-valid': genuinely signed, but its dates cannot be read.
 */
export type Verdict = 'genuine' | 'not-genuine' | 'revoked' | 'expired' | 'not-yet-valid' | 'not-valid' | 'unchecked' | 'identity'

export interface SignerParty {
  address: string
  chainId: number | null
  /** The public profile, when the lookup found one. */
  profile: PartyProfile | null
  /** False when the profile lookup failed (not "no profile"). */
  looked: boolean
}

export interface PartyProfile {
  documentId: string
  handle: string | null
  displayName: string | null
  username: string | null
  avatar: string | null
}

export interface AppParty {
  did: string
  /** The app name the authorising credential carries (credentialSubject.app), never the unsigned signer.app.name. */
  claimedName: string | null
  profile: AppPartyProfile | null
  looked: boolean
  /** A CLI or other session: the credential's subject is the user's own DID, not an app key. */
  session: boolean
}

export interface AppPartyProfile {
  documentId: string
  name: string | null
  logoRef: string | null
}

export interface ReportTime {
  label: string
  iso: string
}

export interface Report {
  kind: InputKind
  verdict: Verdict
  /** The banner's sentence: why this verdict, in plain words. */
  summary: string
  checks: Check[]
  signer: SignerParty | null
  app: AppParty | null
  times: ReportTime[]
}

export type Lookup<T> = { ok: true; value: T } | { ok: false }

/** A stored credential as the read model returns it (renownCredentials). */
export interface StoredCredential {
  credentialId: string
  issuerEthereumAddress: string
  credentialSubjectId: string | null
  /** The app name the credential carries. */
  credentialSubjectApp: string
  issuanceDate: string
  expirationDate: string | null
  revoked: boolean
  revokedAt: string | null
  revocationReason: string | null
}

/** A stored credential with everything needed to re-check its signature (credential id lookups). */
export interface StoredCredentialFull extends StoredCredential {
  context: string[]
  type: string[]
  issuerId: string
  credentialSchemaId: string
  credentialSchemaType: string
  proofValue: string
  proofEthereumAddress: string
  /** JSON of the EIP-712 domain, e.g. {"version":"1","chainId":1}. */
  proofEip712Domain: string
}

/** The public reads /verify makes; injected so the checks are testable without a network. */
export interface VerifyLookups {
  /** Every stored credential with this exact VC id (more than one only if someone stored a junk copy). */
  credentialById(credentialId: string): Promise<Lookup<StoredCredentialFull[]>>
  /** Every stored credential `address` issued to `appDid`, revoked ones included. */
  credentialsFor(appDid: string, address: string): Promise<Lookup<StoredCredential[]>>
  profileByAddress(address: string): Promise<Lookup<PartyProfile | null>>
  appProfile(appDid: string): Promise<Lookup<AppPartyProfile | null>>
}

/** Outcome of an on-chain (ERC-1271 / ERC-6492) signature check. */
export type ContractSignature = 'valid' | 'invalid' | 'not-contract' | 'unavailable'

export interface ContractSignatureArgs {
  chainId: number
  address: string
  signature: string
  /** EIP-712 typed data (domain, types, primaryType, message). */
  typedData: Record<string, unknown>
}

/** A Renown credential normalised to the fields its EIP-712 signature covers (PowerhouseVerifiableCredential). */
export interface CredentialForSignature {
  '@context': string[]
  type: string[]
  id: string
  issuer: { id: string; ethereumAddress: `0x${string}` }
  credentialSubject: { id: string; app: string }
  credentialSchema: { id: string; type: string }
  issuanceDate: string
  expirationDate: string
  proof: {
    type: string
    created: string
    verificationMethod: string
    proofPurpose: string
    proofValue: string
    ethereumAddress: `0x${string}`
    eip712: { domain: { version: string; chainId: number }; primaryType: 'VerifiableCredential' }
  }
}

export interface VerifyDeps {
  lookups: VerifyLookups
  /** Offline EIP-712 check of an EOA signature (verifyCredentialSignature from @renown/sdk). */
  eoaSignature(credential: CredentialForSignature): Promise<boolean>
  /** verifyAuthBearerToken from @renown/sdk: signature, dates and a Renown sign-in subject. */
  bearerToken(jwt: string, audience: string | undefined): Promise<boolean>
  /** Smart-wallet fallback after the offline EOA check failed. */
  contractSignature(args: ContractSignatureArgs): Promise<ContractSignature>
  now: Date
}
