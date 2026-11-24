import { runtimeConfig } from '../lib/runtime-config'
import { GraphQLClient, gql } from 'graphql-request'

const SWITCHBOARD_ENDPOINT =
  runtimeConfig().switchboardEndpoint

const CREATE_DRIVE_MUTATION = gql`
  mutation CreateDrive($id: String!, $name: String!, $slug: String!) {
    addDrive(id: $id, name: $name, slug: $slug) {
      id
      name
      slug
    }
  }
`

async function createDrive() {
  const client = new GraphQLClient(SWITCHBOARD_ENDPOINT)

  try {
    const result = await client.request(CREATE_DRIVE_MUTATION, {
      id: 'renown-profiles',
      name: 'Renown Profiles',
      slug: 'renown-profiles',
    })

    console.log('Drive created successfully:', result)
  } catch (error) {
    console.error('Failed to create drive:', error)
  }
}

createDrive()
