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
import { profileMessage, type ProfileFields } from './renown-signed-messages'

const UPSERT_PROFILE = gql`
  mutation UpsertProfile(
    $address: String!
    $username: String
    $userImage: String
    $displayName: String
    $handle: String
    $bio: String
    $links: [RenownProfileLinkInput!]
    $avatar: String
    $signature: String
    $timestamp: String
  ) {
    renown_upsertProfile(
      address: $address
      username: $username
      userImage: $userImage
      displayName: $displayName
      handle: $handle
      bio: $bio
      links: $links
      avatar: $avatar
      signature: $signature
      timestamp: $timestamp
    )
  }
`

const IDENTITY_FIELDS = ['displayName', 'handle', 'bio', 'links', 'avatar'] as const

/**
 * Create or update `address`'s profile; returns its document id. Identity
 * fields left undefined are not sent at all (JSON drops them), so the
 * switchboard sees exactly what was signed.
 * @throws {CredentialWriteError} when the switchboard refuses or fails the write.
 */
export async function upsertProfile(
  params: ProfileFields & { address: string; signature: string; timestamp: string },
): Promise<string> {
  const { address, signature, timestamp } = params
  const username = params.username ?? null
  const userImage = params.userImage ?? null

  let documentId: string | null
  try {
    const data = await client().request<{ renown_upsertProfile: string | null }>(UPSERT_PROFILE, {
      address,
      username,
      userImage,
      displayName: params.displayName,
      handle: params.handle,
      bio: params.bio,
      links: params.links,
      avatar: params.avatar,
      signature,
      timestamp,
    })
    documentId = data.renown_upsertProfile
  } catch (error) {
    if (!isUnknownSchemaError(error)) throw toWriteError(error, 'Failed to update profile')
    // The legacy document writes predate the identity fields.
    if (IDENTITY_FIELDS.some((field) => params[field] != null)) {
      throw new CredentialWriteError(
        501,
        'This Renown switchboard does not support profile identity fields yet',
        'UNSUPPORTED',
      )
    }
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
