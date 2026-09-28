// Credential writes through the switchboard's self-authenticating renown_*
// mutations (renown-package renown-auth subgraph). Each mutation checks its
// caller itself: issuance by the credential's EIP-712 proof, revocation by the
// issuer's personal_sign of revokeMessage(). No request here carries an
// Authorization header: a bearer makes the switchboard judge the token and
// ignore the signature.
//
// A switchboard that predates these mutations answers with an unknown-schema
// error; only then do the functions below fall back to the legacy document
// writes (services/renown-credential-legacy.ts).
import { ClientError, GraphQLClient, gql } from 'graphql-request'
import { verifyMessage } from 'viem'
import { legacyIssueCredential, legacyRevokeDocument } from './renown-credential-legacy'
import { isFreshTimestamp, revokeMessage } from './renown-signed-messages'

const SWITCHBOARD_URL =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT || 'https://switchboard.renown.vetra.io/graphql'

const ISSUE_CREDENTIAL = gql`
  mutation IssueCredential($input: RenownCredential_InitInput!, $username: String, $userImage: String) {
    renown_issueCredential(input: $input, username: $username, userImage: $userImage)
  }
`

const REVOKE_CREDENTIAL = gql`
  mutation RevokeCredential($credentialId: String!, $signature: String, $timestamp: String) {
    renown_revokeCredential(credentialId: $credentialId, signature: $signature, timestamp: $timestamp)
  }
`

const LOOKUP_CREDENTIALS = gql`
  query LookupCredential($input: RenownCredentialsInput!) {
    renownCredentials(input: $input) {
      documentId
      credentialId
    }
  }
`

const LOOKUP_PROFILE = gql`
  query RenownUsers($input: RenownUsersInput!) {
    renownUsers(input: $input) {
      documentId
    }
  }
`

interface EIP712Domain {
  version: string
  chainId: bigint | number
}

export interface EIP712Credential {
  '@context': string[]
  type: string[]
  id: string
  issuer: {
    id: string
    ethereumAddress: string
  }
  credentialSubject: {
    id: string
    app: string
  }
  credentialSchema: {
    id: string
    type: string
  }
  issuanceDate: string
  expirationDate: string
}

/** The renown-credential model's INIT input (`RenownCredential_InitInput`). */
export type CredentialInitInput = ReturnType<typeof toInitInput>

/** A switchboard write refused or failed; `status` is the HTTP status to relay. */
export class CredentialWriteError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'CredentialWriteError'
  }
}

const STATUS_BY_CODE: Record<string, number> = {
  BAD_USER_INPUT: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
}

function graphqlErrors(error: unknown): { message: string; extensions?: { code?: unknown } }[] {
  if (!(error instanceof ClientError)) return []
  return (error.response.errors ?? []) as { message: string; extensions?: { code?: unknown } }[]
}

/**
 * True when the switchboard rejected the operation only because it doesn't
 * know the renown_* schema (a release before the renown-auth subgraph). A
 * variable-coercion error ("got invalid value") mentions types too but is a
 * bad request, not a missing schema.
 */
export function isUnknownSchemaError(error: unknown): boolean {
  const errors = graphqlErrors(error)
  return (
    errors.length > 0 &&
    errors.every(
      ({ message }) =>
        !message.includes('got invalid value') &&
        (message.includes('Cannot query field "renown_') || message.includes('Unknown type "RenownCredential_')),
    )
  )
}

/** Maps a switchboard GraphQL error to the status the API route relays. */
function toWriteError(error: unknown, fallbackMessage: string): CredentialWriteError {
  const [first] = graphqlErrors(error)
  if (first) {
    const code = typeof first.extensions?.code === 'string' ? first.extensions.code : undefined
    return new CredentialWriteError((code && STATUS_BY_CODE[code]) || 500, first.message, code)
  }
  return new CredentialWriteError(500, `${fallbackMessage}: ${String(error)}`)
}

function client(): GraphQLClient {
  return new GraphQLClient(SWITCHBOARD_URL)
}

/** The issuer's Ethereum address: from the did:pkh issuer id, else the explicit field. */
export function issuerAddressOf(credential: EIP712Credential): string | undefined {
  const parts = credential.issuer.id.split(':')
  if (parts.length >= 5 && parts[0] === 'did' && parts[1] === 'pkh') return parts[4]
  return credential.issuer.ethereumAddress || undefined
}

function toInitInput(credential: EIP712Credential, signature: string, domain: EIP712Domain) {
  return {
    id: credential.id,
    context: credential['@context'],
    type: credential.type,
    issuer: {
      id: credential.issuer.id,
      ethereumAddress: credential.issuer.ethereumAddress,
    },
    credentialSubject: {
      id: credential.credentialSubject.id,
      app: credential.credentialSubject.app,
    },
    credentialSchema: {
      id: credential.credentialSchema.id,
      type: credential.credentialSchema.type,
    },
    issuanceDate: credential.issuanceDate,
    expirationDate: credential.expirationDate || undefined,
    proof: {
      type: 'EthereumEip712Signature2021',
      created: credential.issuanceDate,
      verificationMethod: credential.issuer.id,
      proofPurpose: 'assertionMethod',
      proofValue: signature,
      ethereumAddress: credential.issuer.ethereumAddress,
      eip712: {
        domain: {
          version: domain.version,
          chainId: typeof domain.chainId === 'bigint' ? Number(domain.chainId) : domain.chainId,
        },
        primaryType: 'VerifiableCredential',
      },
    },
  }
}

/** Best-effort read of the address's profile document id (read model; may lag a fresh write). */
async function findProfileDocumentId(ethAddress: string): Promise<string | undefined> {
  try {
    const data = await client().request<{ renownUsers: { documentId: string }[] }>(LOOKUP_PROFILE, {
      input: {
        driveId: `renown-${ethAddress.toLowerCase()}`,
        ethAddresses: [ethAddress.toLowerCase()],
      },
    })
    return data.renownUsers[0]?.documentId
  } catch (e) {
    console.error('Failed to fetch user profile documentId:', e)
    return undefined
  }
}

/**
 * Store a signed delegation credential. The switchboard verifies its EIP-712
 * proof and seeds the issuer's profile from `username`/`userImage` only if the
 * issuer has none yet. Returns the credential document id and, when the read
 * model already has it, the profile document id.
 * @throws {CredentialWriteError} when the switchboard refuses the credential.
 */
export async function issueCredential(params: {
  credential: EIP712Credential
  signature: string
  domain: EIP712Domain
  ethAddress: string
  username?: string
  userImage?: string | null
  docId?: string
}): Promise<{ documentId: string; userDocumentId?: string }> {
  const { credential, signature, domain, ethAddress, username, userImage, docId } = params
  const input = toInitInput(credential, signature, domain)

  let documentId: string | null
  try {
    const data = await client().request<{ renown_issueCredential: string | null }>(ISSUE_CREDENTIAL, {
      input,
      username: username ?? null,
      userImage: userImage ?? null,
    })
    documentId = data.renown_issueCredential
  } catch (error) {
    if (isUnknownSchemaError(error)) {
      return legacyIssueCredential({ input, ethAddress, username, userImage, docId })
    }
    throw toWriteError(error, 'Failed to store credential')
  }
  if (!documentId) throw new CredentialWriteError(500, 'Failed to store credential')

  return { documentId, userDocumentId: docId ?? (await findProfileDocumentId(ethAddress)) }
}

/** The address's stored credentials (read model). */
export async function findCredentialDocuments(
  address: string,
  options: { includeRevoked: boolean },
): Promise<{ documentId: string; credentialId: string }[]> {
  const data = await client().request<{
    renownCredentials: { documentId: string; credentialId: string }[]
  }>(LOOKUP_CREDENTIALS, {
    input: {
      driveId: `renown-${address.toLowerCase()}`,
      ethAddress: address.toLowerCase(),
      includeRevoked: options.includeRevoked,
    },
  })
  return data.renownCredentials
}

/**
 * Revoke a credential by its VC id, authorized by the issuer's personal_sign
 * of `revokeMessage(credentialId, timestamp)`.
 *
 * Legacy fallback (switchboard without renown_revokeCredential): the
 * switchboard can't check the signature, so it is checked here against
 * `address` before the credential's document is revoked directly.
 * @throws {CredentialWriteError} when the revocation is refused or fails.
 */
export async function revokeCredential(params: {
  credentialId: string
  signature: string
  timestamp: string
  /** Issuer address; needed only by the legacy fallback. */
  address?: string
  /** Document holding the credential, if the caller already resolved it (legacy fallback). */
  documentId?: string
  /** Revocation reason; only the legacy fallback records it. */
  reason?: string
}): Promise<void> {
  const { credentialId, signature, timestamp } = params
  let revoked: boolean | null
  try {
    const data = await client().request<{ renown_revokeCredential: boolean | null }>(REVOKE_CREDENTIAL, {
      credentialId,
      signature,
      timestamp,
    })
    revoked = data.renown_revokeCredential
  } catch (error) {
    if (isUnknownSchemaError(error)) return legacyRevoke(params)
    throw toWriteError(error, 'Failed to revoke credential')
  }
  if (!revoked) throw new CredentialWriteError(500, 'Failed to revoke credential')
}

async function legacyRevoke(params: {
  credentialId: string
  signature: string
  timestamp: string
  address?: string
  documentId?: string
  reason?: string
}): Promise<void> {
  const { credentialId, signature, timestamp, address, reason } = params
  if (!address) throw new CredentialWriteError(400, 'address is required')

  let signedByAddress = false
  try {
    signedByAddress =
      isFreshTimestamp(timestamp, new Date()) &&
      (await verifyMessage({
        address: address as `0x${string}`,
        message: revokeMessage(credentialId, timestamp),
        signature: signature as `0x${string}`,
      }))
  } catch {
    signedByAddress = false
  }
  if (!signedByAddress) throw new CredentialWriteError(403, 'Forbidden', 'FORBIDDEN')

  let documentId = params.documentId
  if (!documentId) {
    const documents = await findCredentialDocuments(address, { includeRevoked: false })
    documentId = documents.find((doc) => doc.credentialId === credentialId)?.documentId
  }
  if (!documentId) throw new CredentialWriteError(404, 'Credential not found', 'NOT_FOUND')

  await legacyRevokeDocument(documentId, reason)
}
