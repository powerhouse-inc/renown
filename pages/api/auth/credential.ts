import { NextApiRequest, NextApiResponse } from 'next/types'
import { allowCors } from '../[utils]'
import { GraphQLClient } from 'graphql-request'
import { revokeCredential } from '../../../services/renown-credential'

const SWITCHBOARD_ENDPOINT =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT ||
  'https://switchboard.renown-staging.vetra.io/graphql'
const DEFAULT_DRIVE_ID = process.env.NEXT_PUBLIC_RENOWN_DRIVE_ID || 'renown-profiles'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = new GraphQLClient(SWITCHBOARD_ENDPOINT)

  if (req.method === 'GET') {
    // Get credentials by address/chainId/connectId
    const { address, chainId, connectId, driveId, includeRevoked } = req.query

    if (!address) {
      res.status(400).json({ error: 'Address is required' })
      return
    }

    // Use user-specific drive based on their address
    const userDriveId = `renown-${(address as string).toLowerCase()}`
    const finalDriveId = (driveId as string) || userDriveId

    try {
      // Query RenownCredential documents by eth address
      const GET_CREDENTIALS_QUERY = `
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

      const credentialsData = await client.request<{
        renownCredentials: Array<{
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
        }>
      }>(GET_CREDENTIALS_QUERY, {
        input: {
          driveId: finalDriveId,
          ethAddress: address,
          includeRevoked: includeRevoked === 'true',
        },
      })

      let credentials = credentialsData.renownCredentials

      console.log(`Found ${credentials.length} credentials for address ${address}`)

      // If no credentials at all, return 404 immediately
      if (credentials.length === 0) {
        res.status(404).json({ error: 'Credential not found' })
        return
      }

      // Filter by chainId if provided
      // The issuerId format is: did:pkh:eip155:chainId:address
      if (chainId) {
        const normalizedAddress = (address as string).toLowerCase()
        const expectedIssuerId = `did:pkh:eip155:${chainId}:${normalizedAddress}`

        const filtered = credentials.filter((cred) => {
          return cred.issuerId.toLowerCase() === expectedIssuerId.toLowerCase()
        })

        console.log(`After chainId filter (${chainId}): ${filtered.length} credentials`)
        if (filtered.length > 0) {
          credentials = filtered
        }
      }

      // Filter by connectId if provided
      // connectId is stored in credentialSubjectId
      if (connectId) {
        const filtered = credentials.filter((cred) => {
          return cred.credentialSubjectId === connectId
        })

        console.log(`After connectId filter (${connectId}): ${filtered.length} credentials`)
        if (filtered.length > 0) {
          credentials = filtered
        }
      }

      // Return the first valid credential (SDK expects a single credential, not an array)
      const credential = credentials[0]

      // Parse EIP-712 domain from JSON string
      let eip712Domain
      try {
        eip712Domain = JSON.parse(credential.proofEip712Domain)
      } catch {
        eip712Domain = null
      }

      // Transform to SDK format (PowerhouseVerifiableCredential)
      res.status(200).json({
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
                  domain: eip712Domain.domain,
                  types: eip712Domain.types,
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
