// v6 reactor API - uses createEmptyDocument + mutateDocument
import { NextApiRequest, NextApiResponse } from 'next/types'
import { allowCors } from '../[utils]'
import { GraphQLClient } from 'graphql-request'
import { v4 as uuidv4 } from 'uuid'
import { storeCredential, revokeCredential } from '../../../services/renown-credential'

function makeAction(type: string, input: Record<string, unknown>) {
  return {
    id: uuidv4(),
    type,
    input,
    scope: 'global',
    timestampUtcMs: Date.now(),
  }
}

const SWITCHBOARD_ENDPOINT =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT ||
  'https://switchboard.renown.vetra.io/graphql'
const DEFAULT_DRIVE_ID = process.env.NEXT_PUBLIC_RENOWN_DRIVE_ID || 'renown-profiles'

interface EIP712Domain {
  version: string
  chainId: bigint | number
}

interface EIP712Credential {
  '@context': string[]
  type: string[]
  id: string
  issuer: {
    id: string
    ethereumAddress: string
  }
  credentialSubject: {
    id: string
    app: string
  }
  credentialSchema: {
    id: string
    type: string
  }
  issuanceDate: string
  expirationDate: string
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = new GraphQLClient(SWITCHBOARD_ENDPOINT)

  if (req.method === 'POST') {
    // Create/Add an EIP-712 credential
    const { driveId, docId, credential, signature, domain, username, userImage } = req.body as {
      driveId?: string
      docId?: string
      credential: EIP712Credential
      signature: string
      domain: EIP712Domain
      username?: string
      userImage?: string | null
    }

    if (!credential || !signature || !domain) {
      res.status(400).json({ error: 'credential, signature, and domain are required' })
      return
    }

    const finalDriveId = driveId || DEFAULT_DRIVE_ID

    try {
      let finalDocId = docId

      // Extract Ethereum address from the issuer DID
      const issuerParts = credential.issuer.id.split(':')
      let ethAddress: string | undefined

      if (issuerParts.length >= 5 && issuerParts[0] === 'did' && issuerParts[1] === 'pkh') {
        ethAddress = issuerParts[4]
      } else {
        ethAddress = credential.issuer.ethereumAddress
      }

      if (!ethAddress) {
        res.status(400).json({ error: 'Cannot determine user identity - address not found in credential' })
        return
      }

      const userDriveId = `renown-${ethAddress.toLowerCase()}`

      if (!finalDocId) {
        console.log('Setting up user drive for ethAddress:', ethAddress)

        // Try to find existing RenownUser document
        const GET_PROFILE_QUERY = `
          query RenownUsers($input: RenownUsersInput!) {
            renownUsers(input: $input) {
              documentId
              ethAddress
            }
          }
        `

        const profileData = await client.request<{
          renownUsers: { documentId: string; ethAddress: string }[]
        }>(GET_PROFILE_QUERY, {
          input: {
            driveId: userDriveId,
            ethAddresses: [ethAddress],
          },
        })

        if (profileData.renownUsers.length > 0) {
          finalDocId = profileData.renownUsers[0].documentId
          console.log('Found existing RenownUser document:', finalDocId)
        } else {
          // Create RenownUser document
          console.log('Creating RenownUser document')
          const createResult = await client.request<{
            createEmptyDocument: { id: string }
          }>(`
            mutation CreateEmptyDocument($documentType: String!) {
              createEmptyDocument(documentType: $documentType) {
                id
              }
            }
          `, {
            documentType: 'powerhouse/renown-user',
          })

          finalDocId = createResult.createEmptyDocument.id
          console.log('Created new RenownUser document:', finalDocId)

          // Set eth address, username, and userImage in a single mutateDocument call
          const actions = [
            makeAction('SET_ETH_ADDRESS', { ethAddress }),
          ]

          if (username) {
            actions.push(makeAction('SET_USERNAME', { username }))
          }

          if (userImage) {
            actions.push(makeAction('SET_USER_IMAGE', { userImage }))
          }

          await client.request(`
            mutation MutateDocument($documentIdentifier: String!, $actions: [JSONObject!]!) {
              mutateDocument(documentIdentifier: $documentIdentifier, actions: $actions) {
                id
              }
            }
          `, {
            documentIdentifier: finalDocId,
            actions,
          })

          console.log('Set user fields on document')
        }

        // Update username and userImage on existing documents too
        if (finalDocId && (username || userImage)) {
          const updateActions = []

          if (username) {
            updateActions.push(makeAction('SET_USERNAME', { username }))
          }

          if (userImage) {
            updateActions.push(makeAction('SET_USER_IMAGE', { userImage }))
          }

          if (updateActions.length > 0) {
            try {
              await client.request(`
                mutation MutateDocument($documentIdentifier: String!, $actions: [JSONObject!]!) {
                  mutateDocument(documentIdentifier: $documentIdentifier, actions: $actions) {
                    id
                  }
                }
              `, {
                documentIdentifier: finalDocId,
                actions: updateActions,
              })
            } catch (e) {
              console.error('Failed to update user fields:', e)
            }
          }
        }
      }

      // Store credential
      const result = await storeCredential({
        driveId: userDriveId,
        credential,
        signature,
        domain,
        ethAddress,
      })

      if (result.success && result.credentialId) {
        res.status(200).json({
          result: true,
          documentId: result.credentialId,
          credentialId: result.credentialId,
          userDocumentId: finalDocId,
        })
      } else {
        res.status(500).json({ error: 'Failed to store credential' })
      }
    } catch (e) {
      console.error('Failed to store credential:', e)
      res.status(500).json({ error: 'Failed to store credential', details: String(e) })
    }
  } else if (req.method === 'DELETE') {
    const { credentialId, reason } = req.body as {
      credentialId?: string
      reason?: string
    }

    if (!credentialId) {
      res.status(400).json({ error: 'credentialId is required' })
      return
    }

    try {
      const success = await revokeCredential({
        credentialId,
        reason,
      })

      if (success) {
        res.status(200).json({ result: true })
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
