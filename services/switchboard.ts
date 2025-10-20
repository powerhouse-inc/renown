import { GraphQLClient } from 'graphql-request'

const SWITCHBOARD_ENDPOINT =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT ||
  'http://localhost:4001/graphql'

const client = new GraphQLClient(SWITCHBOARD_ENDPOINT)

export interface GetProfileInput {
  driveId: string
  id?: string
  username?: string
  ethAddress?: string
}

export interface RenownProfile {
  documentId: string
  username?: string | null
  ethAddress?: string | null
  userImage?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

interface RenownUsersInput {
  driveId?: string
  phids?: string[]
  ethAddresses?: string[]
  usernames?: string[]
}

const GET_PROFILE_QUERY = `
  query RenownUsers($input: RenownUsersInput!) {
    renownUsers(input: $input) {
      documentId
      username
      ethAddress
      userImage
      createdAt
      updatedAt
    }
  }
`

export async function getProfile(input: GetProfileInput): Promise<RenownProfile | null> {
  try {
    const renownUsersInput: RenownUsersInput = {
      driveId: input.driveId,
      ...(input.id && { phids: [input.id] }),
      ...(input.ethAddress && { ethAddresses: [input.ethAddress] }),
      ...(input.username && { usernames: [input.username] }),
    }

    const data = await client.request<{ renownUsers: RenownProfile[] }>(GET_PROFILE_QUERY, {
      input: renownUsersInput,
    })

    // Return first result or null
    return data.renownUsers.length > 0 ? data.renownUsers[0] : null
  } catch (error) {
    console.error('Failed to fetch profile from switchboard:', error)
    return null
  }
}
