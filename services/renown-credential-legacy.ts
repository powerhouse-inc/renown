// Legacy credential writes: raw createEmptyDocument/mutateDocument calls for a
// switchboard that predates the renown_* mutations (renown-package < the
// renown-auth subgraph). Used only as a fallback by services/renown-credential.ts;
// delete once every Renown switchboard serves renown_issueCredential and
// renown_revokeCredential.
import { GraphQLClient, gql } from 'graphql-request'
import { v4 as uuidv4 } from 'uuid'
import type { CredentialInitInput } from './renown-credential'

const SWITCHBOARD_URL =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT || 'https://switchboard.renown.vetra.io/graphql'

function makeAction(type: string, input: Record<string, unknown>) {
  return {
    id: uuidv4(),
    type,
    input,
    scope: 'global',
    timestampUtcMs: new Date().toISOString(),
  }
}

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

const GET_PROFILE_QUERY = gql`
  query RenownUsers($input: RenownUsersInput!) {
    renownUsers(input: $input) {
      documentId
      ethAddress
    }
  }
`

function client(): GraphQLClient {
  return new GraphQLClient(SWITCHBOARD_URL)
}

async function createDocument(documentType: string): Promise<string> {
  const result = await client().request<{ createEmptyDocument: { id: string } }>(CREATE_EMPTY_DOCUMENT, {
    documentType,
  })
  const id = result.createEmptyDocument.id
  if (!id) throw new Error(`Failed to create ${documentType} document`)
  return id
}

async function mutateDocument(documentIdentifier: string, actions: ReturnType<typeof makeAction>[]): Promise<void> {
  await client().request(MUTATE_DOCUMENT, { documentIdentifier, actions })
}

/** Find-or-create the address's RenownUser document and refresh its fields. */
async function resolveProfileDocument(params: {
  ethAddress: string
  username?: string
  userImage?: string | null
}): Promise<string> {
  const { ethAddress, username, userImage } = params
  const profileData = await client().request<{
    renownUsers: { documentId: string; ethAddress: string }[]
  }>(GET_PROFILE_QUERY, {
    input: {
      driveId: `renown-${ethAddress.toLowerCase()}`,
      ethAddresses: [ethAddress],
    },
  })

  const fieldActions: ReturnType<typeof makeAction>[] = []
  if (username) fieldActions.push(makeAction('SET_USERNAME', { username }))
  if (userImage) fieldActions.push(makeAction('SET_USER_IMAGE', { userImage }))

  if (profileData.renownUsers.length > 0) {
    const existingId = profileData.renownUsers[0].documentId
    if (fieldActions.length > 0) {
      try {
        await mutateDocument(existingId, fieldActions)
      } catch (e) {
        console.error('Failed to update user fields:', e)
      }
    }
    return existingId
  }

  const newId = await createDocument('powerhouse/renown-user')
  await mutateDocument(newId, [makeAction('SET_ETH_ADDRESS', { ethAddress }), ...fieldActions])
  return newId
}

/**
 * Store a credential as a new RenownCredential document, resolving the
 * issuer's profile document alongside (best effort: its failure does not fail
 * the store). Returns the credential and profile document ids.
 */
export async function legacyIssueCredential(params: {
  input: CredentialInitInput
  ethAddress: string
  username?: string
  userImage?: string | null
  docId?: string
}): Promise<{ documentId: string; userDocumentId?: string }> {
  const { input, ethAddress, username, userImage, docId } = params

  const storeCredential = async (): Promise<string> => {
    const credentialDocId = await createDocument('powerhouse/renown-credential')
    await mutateDocument(credentialDocId, [makeAction('INIT', input as unknown as Record<string, unknown>)])
    return credentialDocId
  }

  const [userDocumentId, documentId] = await Promise.all([
    (docId ? Promise.resolve(docId) : resolveProfileDocument({ ethAddress, username, userImage })).catch((e) => {
      console.error('Failed to resolve user profile document:', e)
      return undefined
    }),
    storeCredential(),
  ])
  return { documentId, userDocumentId }
}

/** Revoke the credential stored in `documentId`. */
export async function legacyRevokeDocument(documentId: string, reason?: string): Promise<void> {
  await mutateDocument(documentId, [
    makeAction('REVOKE', {
      revokedAt: new Date().toISOString(),
      reason: reason || null,
    }),
  ])
}
