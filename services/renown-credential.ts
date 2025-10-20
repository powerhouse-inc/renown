import { request, gql } from 'graphql-request'

const SWITCHBOARD_URL =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT ||
  'https://switchboard.renown-staging.vetra.io/graphql'

const CREATE_CREDENTIAL_MUTATION = gql`
  mutation RenownCredential_createDocument($name: String!, $driveId: String) {
    RenownCredential_createDocument(name: $name, driveId: $driveId)
  }
`

const INIT_CREDENTIAL_MUTATION = gql`
  mutation RenownCredential_init($docId: PHID!, $input: RenownCredential_InitInput!) {
    RenownCredential_init(docId: $docId, input: $input)
  }
`

const REVOKE_CREDENTIAL_MUTATION = gql`
  mutation RenownCredential_revoke($docId: PHID!, $input: RenownCredential_RevokeInput!) {
    RenownCredential_revoke(docId: $docId, input: $input)
  }
`

/**
 * Create and initialize a new RenownCredential document
 */
export async function storeCredential(params: {
  driveId?: string
  jwt: string
  ethAddress: string
}): Promise<{ success: boolean; credentialId?: string }> {
  try {
    // Create a new RenownCredential document
    const createResult = (await request(SWITCHBOARD_URL, CREATE_CREDENTIAL_MUTATION, {
      name: `Credential for ${params.ethAddress.slice(0, 8)}...`,
      driveId: params.driveId,
    })) as { RenownCredential_createDocument: string }

    const credentialId = createResult.RenownCredential_createDocument

    if (!credentialId) {
      throw new Error('Failed to create credential document')
    }

    // Initialize the credential with JWT
    const initResult = (await request(SWITCHBOARD_URL, INIT_CREDENTIAL_MUTATION, {
      docId: credentialId,
      input: {
        jwt: params.jwt,
      },
    })) as { RenownCredential_init: number }

    return {
      success: initResult.RenownCredential_init > 0,
      credentialId,
    }
  } catch (error) {
    console.error('Failed to store credential:', error)
    throw error
  }
}

/**
 * Revoke an existing credential
 */
export async function revokeCredential(params: {
  credentialId: string
  reason?: string
  revokedAt?: string
}): Promise<boolean> {
  try {
    const result = (await request(SWITCHBOARD_URL, REVOKE_CREDENTIAL_MUTATION, {
      docId: params.credentialId,
      input: {
        revokedAt: params.revokedAt || new Date().toISOString(),
        reason: params.reason || null,
      },
    })) as { RenownCredential_revoke: number }

    return result.RenownCredential_revoke > 0
  } catch (error) {
    console.error('Failed to revoke credential:', error)
    throw error
  }
}
