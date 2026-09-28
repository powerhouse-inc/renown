// Profile writes through the switchboard's self-authenticating
// renown_upsertProfile mutation, authorized by the address's personal_sign of
// profileMessage(). Like the credential writes, no request carries an
// Authorization header, and a switchboard without the renown_* schema falls
// back to the legacy document writes with the signature checked here.
import { gql } from 'graphql-request'
import {
  CredentialWriteError,
  assertSignedBy,
  client,
  isUnknownSchemaError,
  toWriteError,
} from './renown-credential'
import { legacyUpsertProfile } from './renown-credential-legacy'
import { profileMessage } from './renown-signed-messages'

const UPSERT_PROFILE = gql`
  mutation UpsertProfile(
    $address: String!
    $username: String
    $userImage: String
    $signature: String
    $timestamp: String
  ) {
    renown_upsertProfile(
      address: $address
      username: $username
      userImage: $userImage
      signature: $signature
      timestamp: $timestamp
    )
  }
`

/**
 * Create or update `address`'s profile; returns its document id.
 * @throws {CredentialWriteError} when the switchboard refuses or fails the write.
 */
export async function upsertProfile(params: {
  address: string
  username?: string | null
  userImage?: string | null
  signature: string
  timestamp: string
}): Promise<string> {
  const { address, signature, timestamp } = params
  const username = params.username ?? null
  const userImage = params.userImage ?? null

  let documentId: string | null
  try {
    const data = await client().request<{ renown_upsertProfile: string | null }>(UPSERT_PROFILE, {
      address,
      username,
      userImage,
      signature,
      timestamp,
    })
    documentId = data.renown_upsertProfile
  } catch (error) {
    if (!isUnknownSchemaError(error)) throw toWriteError(error, 'Failed to update profile')
    await assertSignedBy(
      address,
      await profileMessage(address, { username, userImage }, timestamp),
      signature,
      timestamp,
    )
    return legacyUpsertProfile({ ethAddress: address.toLowerCase(), username, userImage })
  }
  if (!documentId) throw new CredentialWriteError(500, 'Failed to update profile')
  return documentId
}
