import { NextApiRequest, NextApiResponse } from 'next/types'
import { allowCors } from '../[utils]'
import { revokeCredential } from '../../../services/renown-credential'
import { queryRenownCredentials, queryRenownUsers } from '../../../services/switchboard'
import { CREDENTIAL_TYPES } from '../../../services/wallet'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Get credentials by address/chainId/appId
    const { address, chainId, appId, connectId, driveId, includeRevoked } = req.query

    if (!address) {
      res.status(400).json({ error: 'Address is required' })
      return
    }

    // Use user-specific drive based on their address
    const userDriveId = `renown-${(address as string).toLowerCase()}`
    const finalDriveId = (driveId as string) || userDriveId

    try {
      // Pass app DID to the subgraph query for server-side filtering
      const appDid = appId || connectId

      // Profile doc id fetched concurrently but as a SEPARATE request, so a
      // failure degrades to undefined instead of failing the credential fetch.
      const userDocumentIdPromise = queryRenownUsers({
        driveId: finalDriveId,
        ethAddresses: [(address as string).toLowerCase()],
      })
        .then((users) => users[0]?.documentId)
        .catch((e) => {
          console.error('Failed to fetch user profile documentId:', e)
          return undefined as string | undefined
        })

      let credentials = await queryRenownCredentials({
        driveId: finalDriveId,
        ethAddress: (address as string).toLowerCase(),
        did: appDid as string | undefined,
        includeRevoked: includeRevoked === 'true',
      })

      console.log(
        `Found ${credentials.length} credentials for address ${address} ${appDid ? `and app ${appDid}` : ''}`,
      )

      // Filter by chainId if provided
      // The issuerId format is: did:pkh:eip155:chainId:address
      if (chainId) {
        const normalizedAddress = (address as string).toLowerCase()
        const expectedIssuerId = `did:pkh:eip155:${chainId}:${normalizedAddress}`

        credentials = credentials.filter((cred) => {
          return cred.issuerId.toLowerCase() === expectedIssuerId.toLowerCase()
        })
      }

      // Drop expired credentials so callers don't need to re-check client-side.
      // Credentials with no expirationDate are treated as non-expiring.
      const now = new Date()
      credentials = credentials.filter((cred) => {
        if (!cred.expirationDate) return true
        return new Date(cred.expirationDate) > now
      })

      // If no credentials are found after applying filters, return 404
      if (credentials.length === 0) {
        res.status(404).json({ error: 'Credential not found' })
        return
      }

      // Return the most recent credential
      const credential = credentials.reduce((prev, curr) => {
        return prev.issuanceDate > curr.issuanceDate ? prev : curr
      })

      // Parse EIP-712 domain from JSON string. The processor stores the
      // domain object itself (e.g. {"version":"1","chainId":1}), but also
      // accept a legacy wrapper shape ({domain, types}) just in case.
      let eip712Domain
      try {
        const parsed = JSON.parse(credential.proofEip712Domain)
        eip712Domain = parsed?.domain ?? parsed
      } catch {
        eip712Domain = null
      }
      if (eip712Domain && typeof eip712Domain.chainId !== 'number') {
        eip712Domain = null
      }

      // Resolve the profile-id lookup fired in parallel above.
      const userDocumentId = await userDocumentIdPromise

      // Transform to SDK format (PowerhouseVerifiableCredential)
      res.status(200).json({
        userDocumentId,
        credential: {
          '@context': credential.context,
          id: credential.credentialId,
          type: credential.type,
          issuer: {
            id: credential.issuerId,
            ethereumAddress: credential.issuerEthereumAddress as `0x${string}`,
          },
          issuanceDate: credential.issuanceDate,
          expirationDate: credential.expirationDate || undefined,
          credentialSubject: {
            id: credential.credentialSubjectId || credential.issuerId,
            app: credential.credentialSubjectApp,
          },
          credentialStatus: credential.credentialStatusId
            ? {
                id: credential.credentialStatusId,
                type: credential.credentialStatusType!,
              }
            : undefined,
          credentialSchema: {
            id: credential.credentialSchemaId,
            type: credential.credentialSchemaType,
          },
          proof: {
            verificationMethod: credential.proofVerificationMethod,
            ethereumAddress: credential.proofEthereumAddress as `0x${string}`,
            created: credential.proofCreated,
            proofPurpose: credential.proofPurpose,
            type: credential.proofType,
            proofValue: credential.proofValue,
            eip712: eip712Domain
              ? {
                  domain: eip712Domain,
                  types: CREDENTIAL_TYPES,
                  primaryType: credential.proofEip712PrimaryType as 'VerifiableCredential',
                }
              : undefined,
          },
        },
      })
    } catch (e) {
      console.error('Failed to fetch credentials:', e)
      res.status(500).json({ error: 'Failed to fetch credentials', details: String(e) })
    }
  } else if (req.method === 'DELETE') {
    // Revoke a credential
    const { id, reason } = req.query

    if (!id) {
      res.status(400).json({ error: 'Credential ID is required' })
      return
    }

    try {
      const success = await revokeCredential({
        credentialId: id as string,
        reason: reason as string | undefined,
      })

      if (success) {
        res.status(200).json({ result: true, credentialId: id })
      } else {
        res.status(500).json({ error: 'Failed to revoke credential' })
      }
    } catch (e) {
      console.error('Failed to revoke credential:', e)
      res.status(500).json({ error: 'Failed to revoke credential', details: String(e) })
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}

export default allowCors(handler)
