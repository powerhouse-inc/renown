import { NextApiRequest, NextApiResponse } from 'next/types'
import { allowCors } from '../[utils]'
import { GraphQLClient } from 'graphql-request'
import { storeCredential, revokeCredential } from '../../../services/renown-credential'
import { decodeJWT } from '../../../services/did-jwt-auth'

const SWITCHBOARD_ENDPOINT =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT ||
  'https://switchboard.renown-staging.vetra.io/graphql'
const DEFAULT_DRIVE_ID = process.env.NEXT_PUBLIC_RENOWN_DRIVE_ID || 'renown-profiles'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = new GraphQLClient(SWITCHBOARD_ENDPOINT)

  if (req.method === 'GET') {
    // Get credentials by address/connectId
    const { address, connectId, driveId } = req.query

    if (!address) {
      res.status(400).json({ error: 'Address is required' })
      return
    }

    const finalDriveId = (driveId as string) || DEFAULT_DRIVE_ID

    try {
      // Query RenownUser to get their credentials
      const GET_USER_QUERY = `
        query GetRenownUser($input: RenownUsersInput!) {
          renownUsers(input: $input) {
            documentId
            ethAddress
            authorizations {
              id
              jwt
              issuer
              subject
              audience
              payload
              revoked
              createdAt
              revokedAt
            }
          }
        }
      `

      const userData = await client.request<{
        renownUsers: Array<{
          documentId: string
          ethAddress: string
          authorizations: Array<{
            id: string
            jwt: string
            issuer: string | null
            subject: string | null
            audience: string | null
            payload: string | null
            revoked: boolean
            createdAt: string | null
            revokedAt: string | null
          }>
        }>
      }>(GET_USER_QUERY, {
        input: {
          driveId: finalDriveId,
          ethAddresses: [address],
        },
      })

      if (userData.renownUsers.length === 0) {
        res.status(200).json({ credentials: [] })
        return
      }

      const user = userData.renownUsers[0]
      let credentials = user.authorizations

      // Filter by connectId if provided
      if (connectId) {
        credentials = credentials.filter((auth) => {
          if (!auth.payload) return false
          try {
            const payload = JSON.parse(auth.payload)
            return payload.connectId === connectId
          } catch {
            return false
          }
        })
      }

      res.status(200).json({
        credentials: credentials.map((cred) => ({
          id: cred.id,
          jwt: cred.jwt,
          issuer: cred.issuer,
          subject: cred.subject,
          audience: cred.audience,
          payload: cred.payload ? JSON.parse(cred.payload) : null,
          revoked: cred.revoked,
          createdAt: cred.createdAt,
          revokedAt: cred.revokedAt,
        })),
      })
    } catch (e) {
      console.error('Failed to fetch credentials:', e)
      res.status(500).json({ error: 'Failed to fetch credentials', details: String(e) })
    }
  } else if (req.method === 'POST') {
    // Create/store a new credential
    const { jwt, driveId } = req.body

    if (!jwt) {
      res.status(400).json({ error: 'JWT is required' })
      return
    }

    const finalDriveId = driveId || DEFAULT_DRIVE_ID

    try {
      // Decode JWT to extract address
      let ethAddress: string | undefined
      try {
        const decoded = decodeJWT(jwt)
        ethAddress = decoded.address as string | undefined

        // Fallback: extract from issuer if address not in payload
        if (!ethAddress && decoded.iss) {
          const issuerParts = decoded.iss.split(':')
          if (issuerParts.length >= 5 && issuerParts[0] === 'did' && issuerParts[1] === 'pkh') {
            ethAddress = issuerParts[4]
          }
        }
      } catch (e) {
        console.error('Failed to decode JWT:', e)
      }

      if (!ethAddress) {
        res.status(400).json({ error: 'Cannot determine user identity - address not found in JWT' })
        return
      }

      // Store credential using RenownCredential mutations
      const result = await storeCredential({
        driveId: finalDriveId,
        jwt,
        ethAddress,
      })

      if (result.success && result.credentialId) {
        res.status(200).json({
          credential: {
            id: result.credentialId,
            jwt,
          },
        })
      } else {
        res.status(500).json({ error: 'Failed to store credential' })
      }
    } catch (e) {
      console.error('Failed to store credential:', e)
      res.status(500).json({ error: 'Failed to store credential', details: String(e) })
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
