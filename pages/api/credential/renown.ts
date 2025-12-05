import { NextApiRequest, NextApiResponse } from 'next/types'
import { allowCors } from '../[utils]'
import { GraphQLClient } from 'graphql-request'
import { storeCredential, revokeCredential } from '../../../services/renown-credential'

const SWITCHBOARD_ENDPOINT =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT ||
  'https://switchboard.renown-staging.vetra.io/graphql'
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
      // Issuer format: "did:pkh:eip155:chainId:address"
      const issuerParts = credential.issuer.id.split(':')
      let ethAddress: string | undefined

      if (issuerParts.length >= 5 && issuerParts[0] === 'did' && issuerParts[1] === 'pkh') {
        ethAddress = issuerParts[4]
      } else {
        // Fallback to ethereumAddress field
        ethAddress = credential.issuer.ethereumAddress
      }

      if (!ethAddress) {
        res.status(400).json({ error: 'Cannot determine user identity - address not found in credential' })
        return
      }

      // Create a user-specific drive ID based on their address
      const userDriveId = `renown-${ethAddress.toLowerCase()}`

      // If no docId provided, we need to find or create the user's drive and documents
      if (!finalDocId) {
        console.log('Setting up user drive for ethAddress:', ethAddress)

        // Try to find existing drive
        const GET_DRIVES_QUERY = `
          query GetDrives {
            drives
          }
        `

        let driveExists = false
        try {
          const drivesData = await client.request<{
            drives: string[]
          }>(GET_DRIVES_QUERY)
          driveExists = drivesData.drives.includes(userDriveId)
          console.log('Drive exists:', driveExists, 'userDriveId:', userDriveId)
          console.log('Available drives:', drivesData.drives)
        } catch (e) {
          console.error('Error checking for existing drive:', e)
          // If we can't check, assume it might exist and skip creation
          driveExists = true
        }

        // Create drive if it doesn't exist
        if (!driveExists) {
          console.log('Creating new drive:', userDriveId)
          const CREATE_DRIVE_MUTATION = `
            mutation AddDrive($id: String!, $name: String!, $slug: String!) {
              addDrive(id: $id, name: $name, slug: $slug) {
                id
                name
                slug
              }
            }
          `

          await client.request(CREATE_DRIVE_MUTATION, {
            id: userDriveId,
            name: `Renown - ${ethAddress.slice(0, 8)}`,
            slug: userDriveId,
          })
          console.log('Created drive:', userDriveId)
        }

        // Try to find existing RenownUser document in the user's drive
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
          // Create RenownUser document in the user's drive
          console.log('Creating RenownUser document in drive:', userDriveId)
          const CREATE_USER_MUTATION = `
            mutation CreateRenownUser($name: String!, $driveId: String) {
              RenownUser_createDocument(name: $name, driveId: $driveId)
            }
          `

          const createResult = await client.request<{
            RenownUser_createDocument: string
          }>(CREATE_USER_MUTATION, {
            name: `User ${ethAddress.slice(0, 8)}`,
            driveId: userDriveId,
          })

          finalDocId = createResult.RenownUser_createDocument
          console.log('Created new RenownUser document:', finalDocId)

          // Set the eth address on the new document
          const SET_ETH_ADDRESS_MUTATION = `
            mutation SetEthAddress($docId: PHID!, $input: RenownUser_SetEthAddressInput!) {
              RenownUser_setEthAddress(docId: $docId, input: $input)
            }
          `

          await client.request(SET_ETH_ADDRESS_MUTATION, {
            docId: finalDocId,
            input: { ethAddress },
          })

          console.log('Set ethAddress on new document')
        }

        // Set username and userImage if provided
        if (finalDocId && username) {
          const SET_USERNAME_MUTATION = `
            mutation SetUsername($docId: PHID!, $input: RenownUser_SetUsernameInput!) {
              RenownUser_setUsername(docId: $docId, input: $input)
            }
          `

          await client.request(SET_USERNAME_MUTATION, {
            docId: finalDocId,
            input: { username },
          })
          console.log('Set username on document:', username)
        }

        if (finalDocId && userImage) {
          const SET_USER_IMAGE_MUTATION = `
            mutation SetUserImage($docId: PHID!, $input: RenownUser_SetUserImageInput!) {
              RenownUser_setUserImage(docId: $docId, input: $input)
            }
          `

          await client.request(SET_USER_IMAGE_MUTATION, {
            docId: finalDocId,
            input: { userImage },
          })
          console.log('Set userImage on document:', userImage)
        }

        // Note: Folders are not supported in the GraphQL API
        // Credentials will be stored directly in the user's drive
      }

      // Store credential using RenownCredential mutations in the user's drive
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
    // Revoke a credential
    const { credentialId, reason } = req.body as {
      credentialId?: string
      reason?: string
    }

    console.log('DELETE /api/credential/renown called')
    console.log('Request body:', { credentialId, reason })

    if (!credentialId) {
      res.status(400).json({ error: 'credentialId is required' })
      return
    }

    try {
      // Revoke the credential
      const success = await revokeCredential({
        credentialId,
        reason,
      })

      if (success) {
        console.log('Revoke successful')
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
