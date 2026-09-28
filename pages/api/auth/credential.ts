import { NextApiRequest, NextApiResponse } from 'next/types'
import { allowCors } from '../../../utils/allow-cors'
import { GraphQLClient } from 'graphql-request'
import {
  CredentialWriteError,
  findCredentialDocuments,
  revokeCredential,
} from '../../../services/renown-credential'
import { CREDENTIAL_TYPES } from '../../../services/wallet'
import { DEFAULT_DRIVE_ID } from '../../../utils/constants'

const SWITCHBOARD_ENDPOINT =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT || 'https://switchboard.renown.vetra.io/graphql'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = new GraphQLClient(SWITCHBOARD_ENDPOINT)

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

      // Pass app DID to the subgraph query for server-side filtering
      const appDid = appId || connectId

      // Profile doc id fetched concurrently but as a SEPARATE request, so a
      // failure degrades to undefined instead of failing the credential fetch.
      const userDocumentIdPromise = client
        .request<{ renownUsers: { documentId: string }[] }>(
          `query RenownUsers($input: RenownUsersInput!) { renownUsers(input: $input) { documentId } }`,
          {
            input: {
              driveId: finalDriveId,
              ethAddresses: [(address as string).toLowerCase()],
            },
          },
        )
        .then((d) => d.renownUsers[0]?.documentId)
        .catch((e) => {
          console.error('Failed to fetch user profile documentId:', e)
          return undefined as string | undefined
        })

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
          ethAddress: (address as string).toLowerCase(),
          did: appDid as string | undefined,
          includeRevoked: includeRevoked === 'true',
        },
      })

      let credentials = credentialsData.renownCredentials

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
    // Revoke the credential stored in document `id`, authorized by the
    // issuer's personal_sign of revokeMessage(<VC id>, timestamp). The
    // signature, timestamp and issuer address come from the JSON body or the
    // query string.
    const body = (req.body ?? {}) as Record<string, unknown>
    const param = (name: string): string | undefined => {
      const value = body[name] ?? req.query[name]
      return typeof value === 'string' && value !== '' ? value : undefined
    }
    const id = param('id')
    const signature = param('signature')
    const timestamp = param('timestamp')
    const address = param('address')

    if (!id) {
      res.status(400).json({ error: 'Credential ID is required' })
      return
    }
    if (!signature || !timestamp) {
      res.status(401).json({ error: 'A signature and timestamp are required to revoke a credential' })
      return
    }
    if (!address) {
      res.status(400).json({ error: 'address is required' })
      return
    }

    try {
      // The signed message names the VC id, so map the document id to it.
      const documents = await findCredentialDocuments(address, { includeRevoked: true })
      const match = documents.find((doc) => doc.documentId === id)
      if (!match) {
        res.status(404).json({ error: 'Credential not found' })
        return
      }

      await revokeCredential({
        credentialId: match.credentialId,
        signature,
        timestamp,
        address,
        documentId: match.documentId,
        reason: param('reason'),
      })
      res.status(200).json({ result: true, credentialId: id })
    } catch (e) {
      if (e instanceof CredentialWriteError) {
        res.status(e.status).json({ error: e.message, code: e.code })
        return
      }
      console.error('Failed to revoke credential:', e)
      res.status(500).json({ error: 'Failed to revoke credential', details: String(e) })
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}

export default allowCors(handler)
