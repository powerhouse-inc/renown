import { request, gql } from 'graphql-request'

const SWITCHBOARD_URL =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT ||
  'https://switchboard.renown-staging.vetra.io/graphql'

export interface Authorization {
  id: string
  jwt: string
  issuer: string | null
  subject: string | null
  audience: string | null
  payload: string | null
  revoked: boolean
  createdAt: Date | string | null
  revokedAt: Date | string | null
  user: {
    documentId: string
    username: string | null
    ethAddress: string | null
    userImage: string | null
    createdAt: Date | string | null
    updatedAt: Date | string | null
  }
}

const ADD_AUTHORIZATION_MUTATION = gql`
  mutation RenownUser_addAuthorization($docId: PHID!, $input: RenownUser_AddAuthorizationInput!) {
    RenownUser_addAuthorization(docId: $docId, input: $input)
  }
`

const REVOKE_AUTHORIZATION_MUTATION = gql`
  mutation RenownUser_revokeAuthorization(
    $docId: PHID!
    $input: RenownUser_RevokeAuthorizationInput!
  ) {
    RenownUser_revokeAuthorization(docId: $docId, input: $input)
  }
`

const GET_AUTHORIZATIONS_QUERY = gql`
  query GetAuthorizations(
    $driveId: String!
    $ethAddress: String!
    $subject: String
    $includeRevoked: Boolean
  ) {
    getAuthorizations(
      input: {
        driveId: $driveId
        ethAddress: $ethAddress
        subject: $subject
        includeRevoked: $includeRevoked
      }
    ) {
      id
      jwt
      issuer
      subject
      audience
      payload
      revoked
      createdAt
      revokedAt
      user {
        documentId
        username
        ethAddress
        userImage
        createdAt
        updatedAt
      }
    }
  }
`

/**
 * Store a new authorization for a user
 */
export async function storeAuthorization(params: {
  docId: string
  id: string
  jwt: string
  issuer?: string
  subject?: string
  audience?: string
  payload?: string
  createdAt?: string
}): Promise<boolean> {
  try {
    const result = (await request(SWITCHBOARD_URL, ADD_AUTHORIZATION_MUTATION, {
      docId: params.docId,
      input: {
        id: params.id,
        jwt: params.jwt,
        issuer: params.issuer || null,
        subject: params.subject || null,
        audience: params.audience || null,
        payload: params.payload || null,
        createdAt: params.createdAt || new Date().toISOString(),
      },
    })) as { RenownUser_addAuthorization: boolean }

    return result.RenownUser_addAuthorization === true
  } catch (error) {
    console.error('Failed to store authorization:', error)
    throw error
  }
}

/**
 * Revoke an existing authorization
 */
export async function revokeAuthorization(params: {
  docId: string
  authorizationId: string
  revokedAt?: string
}): Promise<boolean> {
  try {
    const result = (await request(SWITCHBOARD_URL, REVOKE_AUTHORIZATION_MUTATION, {
      docId: params.docId,
      input: {
        id: params.authorizationId,
        revokedAt: params.revokedAt || new Date().toISOString(),
      },
    })) as { RenownUser_revokeAuthorization: boolean }

    return result.RenownUser_revokeAuthorization === true
  } catch (error) {
    console.error('Failed to revoke authorization:', error)
    throw error
  }
}

/**
 * Fetch authorizations by Ethereum address
 */
export async function fetchAuthorizationsByEthAddress(params: {
  driveId: string
  ethAddress: string
  subject?: string
  includeRevoked?: boolean
}): Promise<Authorization[]> {
  try {
    const result = (await request(SWITCHBOARD_URL, GET_AUTHORIZATIONS_QUERY, {
      driveId: params.driveId,
      ethAddress: params.ethAddress,
      subject: params.subject,
      includeRevoked: params.includeRevoked !== false,
    })) as { getAuthorizations: Authorization[] }

    return result.getAuthorizations
  } catch (error) {
    console.error('Failed to fetch authorizations:', error)
    throw error
  }
}

/**
 * Check if a specific authorization exists and is valid (not revoked)
 */
export async function isAuthorizationValid(params: {
  driveId: string
  ethAddress: string
  subject?: string
}): Promise<boolean> {
  try {
    const authorizations = await fetchAuthorizationsByEthAddress({
      ...params,
      includeRevoked: false,
    })

    return authorizations.length > 0
  } catch (error) {
    console.error('Failed to check authorization validity:', error)
    return false
  }
}

/**
 * Verify if a specific JWT token is valid (exists and not revoked)
 */
export async function verifyToken(params: {
  driveId: string
  ethAddress: string
  jwt: string
}): Promise<boolean> {
  try {
    const authorizations = await fetchAuthorizationsByEthAddress({
      driveId: params.driveId,
      ethAddress: params.ethAddress,
      includeRevoked: false, // Only get non-revoked authorizations
    })

    // Check if the specific JWT exists in the non-revoked authorizations
    return authorizations.some((auth) => auth.jwt === params.jwt)
  } catch (error) {
    console.error('Failed to verify token:', error)
    return false
  }
}
