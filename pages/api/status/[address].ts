import { NextApiRequest, NextApiResponse } from 'next/types'
import { allowCors } from '../[utils]'
import { GraphQLClient, gql } from 'graphql-request'

const SWITCHBOARD_ENDPOINT =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT ||
  'https://switchboard.renown-staging.vetra.io/graphql'
const DEFAULT_DRIVE_ID = process.env.NEXT_PUBLIC_RENOWN_DRIVE_ID || 'renown-profiles'

interface RenownCredential {
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
  revoked: boolean
  revokedAt: string | null
  revocationReason: string | null
  createdAt: string | null
  updatedAt: string | null
}

const GET_CREDENTIALS_QUERY = gql`
  query RenownCredentials($input: RenownCredentialsInput!) {
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
      revoked
      revokedAt
      revocationReason
      createdAt
      updatedAt
    }
  }
`

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // The route parameter is an Ethereum address or DID
  const { address: paramValue } = req.query
  const explicitDriveId = req.query.driveId as string

  if (!paramValue || typeof paramValue !== 'string') {
    res.status(400).json({ error: 'Address is required' })
    return
  }

  try {
    const client = new GraphQLClient(SWITCHBOARD_ENDPOINT)

    // Build the query input
    const queryInput: any = {
      includeRevoked: true, // Include revoked credentials in search
    }

    // Check if it's an Ethereum address or a DID
    let ethAddress: string
    if (paramValue.startsWith('0x')) {
      queryInput.ethAddress = paramValue
      ethAddress = paramValue
    } else if (paramValue.startsWith('did:pkh:eip155:')) {
      // Extract address from DID
      const parts = paramValue.split(':')
      if (parts.length >= 5) {
        queryInput.ethAddress = parts[4]
        ethAddress = parts[4]
      } else {
        res.status(400).json({ error: 'Invalid DID format' })
        return
      }
    } else {
      res.status(400).json({ error: 'Invalid address format. Expected Ethereum address (0x...) or DID' })
      return
    }

    // Use user-specific drive based on their address, or explicit driveId if provided
    const driveId = explicitDriveId || `renown-${ethAddress.toLowerCase()}`
    queryInput.driveId = driveId

    console.log('Querying credentials with input:', queryInput)

    // Query for credentials
    const data = await client.request<{
      renownCredentials: RenownCredential[]
    }>(GET_CREDENTIALS_QUERY, {
      input: queryInput,
    })

    if (!data.renownCredentials || data.renownCredentials.length === 0) {
      res.status(404).json({
        error: 'Credential not found',
        searched: queryInput,
      })
      return
    }

    // Return the first credential (most recent)
    const matchedCredential = data.renownCredentials[0]

    // Return the credential details with clear status
    res.status(200).json({
      documentId: matchedCredential.documentId,
      credentialId: matchedCredential.credentialId,
      status: matchedCredential.revoked ? 'revoked' : 'active',
      revoked: matchedCredential.revoked,
      revokedAt: matchedCredential.revokedAt,
      revocationReason: matchedCredential.revocationReason,
      issuerId: matchedCredential.issuerId,
      issuerEthereumAddress: matchedCredential.issuerEthereumAddress,
      issuanceDate: matchedCredential.issuanceDate,
      expirationDate: matchedCredential.expirationDate,
      credentialSubject: {
        id: matchedCredential.credentialSubjectId,
        app: matchedCredential.credentialSubjectApp,
      },
      createdAt: matchedCredential.createdAt,
      updatedAt: matchedCredential.updatedAt,
    })
  } catch (e) {
    console.error('Failed to lookup credential:', e)
    res.status(500).json({
      error: 'Failed to lookup credential',
      details: String(e),
    })
  }
}

export default allowCors(handler)
