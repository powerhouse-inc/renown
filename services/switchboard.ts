import { GraphQLClient, gql } from 'graphql-request'
import { v4 as uuidv4 } from 'uuid'

export const SWITCHBOARD_ENDPOINT =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT ||
  'https://switchboard.renown.vetra.io/graphql'

export const switchboardClient = new GraphQLClient(SWITCHBOARD_ENDPOINT)

// Reactor action envelope. `timestampUtcMs` must be an ISO-8601 UTC string:
// despite the name, the reactor validates/stores it as a timestamp, not ms.
export function makeAction(type: string, input: Record<string, unknown>) {
  return {
    id: uuidv4(),
    type,
    input,
    scope: 'global',
    timestampUtcMs: new Date().toISOString(),
  }
}

export type ReactorAction = ReturnType<typeof makeAction>

// --- Reactor write primitives ---------------------------------------------

const CREATE_EMPTY_DOCUMENT = gql`
  mutation CreateEmptyDocument($documentType: String!, $parentIdentifier: String) {
    createEmptyDocument(documentType: $documentType, parentIdentifier: $parentIdentifier) {
      id
    }
  }
`

const MUTATE_DOCUMENT = gql`
  mutation MutateDocument($documentIdentifier: String!, $actions: [JSONObject!]!) {
    mutateDocument(documentIdentifier: $documentIdentifier, actions: $actions) {
      id
    }
  }
`

export async function createEmptyDocument(
  documentType: string,
  parentIdentifier?: string,
): Promise<string> {
  const res = await switchboardClient.request<{
    createEmptyDocument: { id: string }
  }>(CREATE_EMPTY_DOCUMENT, { documentType, parentIdentifier })
  return res.createEmptyDocument.id
}

export async function mutateDocument(
  documentIdentifier: string,
  actions: ReactorAction[],
): Promise<void> {
  await switchboardClient.request(MUTATE_DOCUMENT, { documentIdentifier, actions })
}

// --- Read-model queries ----------------------------------------------------

export interface RenownUsersInput {
  driveId?: string
  phids?: string[]
  ethAddresses?: string[]
  usernames?: string[]
}

export interface ReadRenownUser {
  documentId: string
  username?: string | null
  ethAddress?: string | null
  userImage?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

const RENOWN_USERS_QUERY = gql`
  query RenownUsers($input: RenownUsersInput!) {
    renownUsers(input: $input) {
      documentId
      username
      ethAddress
      userImage
      createdAt
      updatedAt
    }
  }
`

export async function queryRenownUsers(
  input: RenownUsersInput,
): Promise<ReadRenownUser[]> {
  const data = await switchboardClient.request<{ renownUsers: ReadRenownUser[] }>(
    RENOWN_USERS_QUERY,
    { input },
  )
  return data.renownUsers
}

export interface RenownCredentialsInput {
  driveId?: string
  ethAddress?: string
  did?: string
  issuer?: string
  includeRevoked?: boolean
}

export interface ReadRenownCredential {
  documentId: string
  credentialId: string
  context: string[]
  type: string[]
  issuerId: string
  issuerEthereumAddress: string
  issuanceDate: string
  expirationDate: string | null
  credentialSubjectId: string | null
  credentialSubjectApp: string
  credentialStatusId: string | null
  credentialStatusType: string | null
  credentialSchemaId: string
  credentialSchemaType: string
  proofVerificationMethod: string
  proofEthereumAddress: string
  proofCreated: string
  proofPurpose: string
  proofType: string
  proofValue: string
  proofEip712Domain: string
  proofEip712PrimaryType: string
  revoked: boolean
  revokedAt: string | null
  revocationReason: string | null
  createdAt: string | null
  updatedAt: string | null
}

const RENOWN_CREDENTIALS_QUERY = gql`
  query GetRenownCredentials($input: RenownCredentialsInput!) {
    renownCredentials(input: $input) {
      documentId
      credentialId
      context
      type
      issuerId
      issuerEthereumAddress
      issuanceDate
      expirationDate
      credentialSubjectId
      credentialSubjectApp
      credentialStatusId
      credentialStatusType
      credentialSchemaId
      credentialSchemaType
      proofVerificationMethod
      proofEthereumAddress
      proofCreated
      proofPurpose
      proofType
      proofValue
      proofEip712Domain
      proofEip712PrimaryType
      revoked
      revokedAt
      revocationReason
      createdAt
      updatedAt
    }
  }
`

export async function queryRenownCredentials(
  input: RenownCredentialsInput,
): Promise<ReadRenownCredential[]> {
  const data = await switchboardClient.request<{
    renownCredentials: ReadRenownCredential[]
  }>(RENOWN_CREDENTIALS_QUERY, { input })
  return data.renownCredentials
}

// --- Convenience ------------------------------------------------------------

interface GetProfileInput {
  driveId: string
  id?: string
  username?: string
  ethAddress?: string
}

// Kept for backwards compatibility; prefer queryRenownUsers directly.
export type RenownProfile = ReadRenownUser

export async function getProfile(
  input: GetProfileInput,
): Promise<RenownProfile | null> {
  try {
    const users = await queryRenownUsers({
      driveId: input.driveId,
      ...(input.id && { phids: [input.id] }),
      ...(input.ethAddress && { ethAddresses: [input.ethAddress] }),
      ...(input.username && { usernames: [input.username] }),
    })
    return users.length > 0 ? users[0] : null
  } catch (error) {
    console.error('Failed to fetch profile from switchboard:', error)
    return null
  }
}
