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
  searchInput?: string
}

export interface RenownProfile {
  documentId: string
  username?: string | null
  ethAddress?: string | null
  userImage?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

const GET_PROFILE_QUERY = `
  query GetProfile($input: GetProfileInput!) {
    getProfile(input: $input) {
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
    const data = await client.request<{ getProfile: RenownProfile }>(GET_PROFILE_QUERY, {
      input,
    })
    return data.getProfile
  } catch (error) {
    console.error('Failed to fetch profile from switchboard:', error)
    return null
  }
}
