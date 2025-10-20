import { request, gql } from 'graphql-request'
import { decodeJWT } from './did-jwt-auth'

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

const UPDATE_CREDENTIAL_SUBJECT_MUTATION = gql`
  mutation RenownCredential_updateCredentialSubject(
    $docId: PHID!
    $input: RenownCredential_UpdateCredentialSubjectInput!
  ) {
    RenownCredential_updateCredentialSubject(docId: $docId, input: $input)
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
    // Decode JWT to extract information
    const decoded = decodeJWT(params.jwt)

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

    if (initResult.RenownCredential_init === 0) {
      throw new Error('Failed to initialize credential with JWT')
    }

    // Update credential subject with DID/address information
    const credentialSubject = {
      id: decoded.sub || decoded.iss || `did:pkh:eip155:1:${params.ethAddress}`,
      address: params.ethAddress,
      ...(decoded.connectId && { connectId: decoded.connectId }),
    }

    await request(SWITCHBOARD_URL, UPDATE_CREDENTIAL_SUBJECT_MUTATION, {
      docId: credentialId,
      input: {
        credentialSubject: JSON.stringify(credentialSubject),
      },
    })

    return {
      success: true,
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
