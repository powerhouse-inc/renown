import { GraphQLClient } from 'graphql-request'
import { SWITCHBOARD_ENDPOINT } from './switchboard-endpoint'

const client = new GraphQLClient(SWITCHBOARD_ENDPOINT)

interface GetProfileInput {
  driveId: string
  id?: string
  username?: string
  ethAddress?: string
  handle?: string
}

export interface RenownProfileLink {
  id: string
  label: string
  url: string
}

export interface RenownProfile {
  documentId: string
  username?: string | null
  ethAddress?: string | null
  userImage?: string | null
  displayName?: string | null
  handle?: string | null
  bio?: string | null
  links?: RenownProfileLink[]
  /** attachment://v1:<sha256> of the uploaded avatar; render it via mediaUrl(). */
  avatar?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

interface RenownUsersInput {
  driveId?: string
  phids?: string[]
  ethAddresses?: string[]
  usernames?: string[]
  handles?: string[]
}

const GET_PROFILE_QUERY = `
  query RenownUsers($input: RenownUsersInput!) {
    renownUsers(input: $input) {
      documentId
      username
      ethAddress
      userImage
      displayName
      handle
      bio
      links { id label url }
      avatar
      createdAt
      updatedAt
    }
  }
`

const HANDLE_AVAILABILITY_QUERY = `
  query HandleAvailability($handle: String!, $address: String) {
    renownHandleAvailability(handle: $handle, address: $address) {
      handle
      available
      reason
    }
  }
`

export interface HandleAvailability {
  handle: string
  available: boolean
  reason: 'INVALID' | 'RESERVED' | 'TAKEN' | null
}

/** Like getProfile, but a failed read throws (null means the profile does not exist). */
export async function fetchProfile(input: GetProfileInput): Promise<RenownProfile | null> {
  const renownUsersInput: RenownUsersInput = {
    driveId: input.driveId,
    ...(input.id && { phids: [input.id] }),
    ...(input.ethAddress && { ethAddresses: [input.ethAddress] }),
    ...(input.username && { usernames: [input.username] }),
    ...(input.handle && { handles: [input.handle] }),
  }

  const data = await client.request<{ renownUsers: RenownProfile[] }>(GET_PROFILE_QUERY, {
    input: renownUsersInput,
  })

  // Return first result or null
  return data.renownUsers.length > 0 ? data.renownUsers[0] : null
}

export async function getProfile(input: GetProfileInput): Promise<RenownProfile | null> {
  try {
    return await fetchProfile(input)
  } catch (error) {
    console.error('Failed to fetch profile from switchboard:', error)
    return null
  }
}

/** Whether `handle` can be claimed by `address` (its own handle counts as available). */
export async function getHandleAvailability(
  handle: string,
  address?: string,
): Promise<HandleAvailability> {
  const data = await client.request<{ renownHandleAvailability: HandleAvailability }>(
    HANDLE_AVAILABILITY_QUERY,
    { handle, address },
  )
  return data.renownHandleAvailability
}
