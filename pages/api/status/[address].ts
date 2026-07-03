import { NextApiRequest, NextApiResponse } from 'next/types'
import { allowCors } from '../[utils]'
import {
  queryRenownCredentials,
  type RenownCredentialsInput,
} from '../../../services/switchboard'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // The route parameter is an Ethereum address or DID
  const { address: paramValue } = req.query
  const explicitDriveId = req.query.driveId as string
  const appDid = (req.query.appId || req.query.connectId) as string | undefined
  const includeRevoked = req.query.includeRevoked === 'true'

  if (!paramValue || typeof paramValue !== 'string') {
    res.status(400).json({ error: 'Address is required' })
    return
  }

  try {
    // Build the query input
    const queryInput: RenownCredentialsInput = {
      includeRevoked,
      did: appDid,
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
    const credentials = await queryRenownCredentials(queryInput)

    if (credentials.length === 0) {
      res.status(404).json({
        error: 'Credential not found',
        searched: queryInput,
      })
      return
    }

    // Return the most recent credential by issuanceDate
    const matchedCredential = credentials.reduce((prev, curr) =>
      prev.issuanceDate > curr.issuanceDate ? prev : curr
    )

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
