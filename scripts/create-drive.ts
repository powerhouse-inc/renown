import { GraphQLClient, gql } from 'graphql-request'

const SWITCHBOARD_ENDPOINT =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT ||
  'https://switchboard.renown-staging.vetra.io/graphql'

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
