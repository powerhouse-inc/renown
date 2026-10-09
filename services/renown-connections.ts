// Browser-side reads and the revoke write behind /me. Reads are public; the
// revoke proves the issuer with a Renown bearer or a personal_sign (see
// lib/me/revoke.ts), sent straight to the switchboard's renown-auth subgraph.
import { ClientError, GraphQLClient } from 'graphql-request'
import type { IssuedCredential } from '../lib/me/connections'
import { RevokeError, type RevokeAuth } from '../lib/me/revoke'
import { APP_PROFILE_FIELDS, type RenownAppProfile } from './app-profiles'
import { switchboardOrigin } from './media'
import { SWITCHBOARD_ENDPOINT } from './switchboard-endpoint'

const ISSUED_CREDENTIALS = `
  query IssuedCredentials($input: RenownCredentialsInput!) {
    renownCredentials(input: $input) {
      documentId
      credentialId
      issuerId
      issuanceDate
      expirationDate
      credentialSubjectId
      credentialSubjectApp
      revoked
    }
  }
`

const REVOKE = `
  mutation RevokeCredential($credentialId: String!, $signature: String, $timestamp: String) {
    renown_revokeCredential(credentialId: $credentialId, signature: $signature, timestamp: $timestamp)
  }
`

/** App profiles are looked up this many per request (one aliased query each). */
const PROFILE_BATCH = 25

/**
 * Unrevoked credentials issued by `address`. Filters on the issuer only: the
 * read model's `ethAddress` filter also requires the proof address to match.
 * A failed read throws.
 */
export async function fetchIssuedCredentials(address: string): Promise<IssuedCredential[]> {
  const data = await new GraphQLClient(SWITCHBOARD_ENDPOINT).request<{ renownCredentials: IssuedCredential[] }>(
    ISSUED_CREDENTIALS,
    { input: { issuer: address.toLowerCase(), includeRevoked: false } },
  )
  return data.renownCredentials
}

/**
 * The app profile of each DID (null when it has none), in aliased batches.
 * A failed batch throws.
 */
export async function fetchAppProfilesFor(dids: string[]): Promise<Record<string, RenownAppProfile | null>> {
  const client = new GraphQLClient(`${switchboardOrigin()}/graphql/renown-stats`)
  const result: Record<string, RenownAppProfile | null> = {}
  for (let start = 0; start < dids.length; start += PROFILE_BATCH) {
    const batch = dids.slice(start, start + PROFILE_BATCH)
    const params = batch.map((_, i) => `$d${i}: String!`).join(', ')
    const fields = batch.map((_, i) => `p${i}: appProfile(appDid: $d${i}) { ${APP_PROFILE_FIELDS} }`).join(' ')
    const variables = Object.fromEntries(batch.map((did, i) => [`d${i}`, did]))
    const data = await client.request<Record<string, RenownAppProfile | null>>(
      `query SubjectAppProfiles(${params}) { ${fields} }`,
      variables,
    )
    batch.forEach((did, i) => (result[did] = data[`p${i}`] ?? null))
  }
  return result
}

function toRevokeError(error: unknown): RevokeError {
  if (error instanceof ClientError) {
    if (error.response.status === 401 || error.response.status === 403) return new RevokeError('FORBIDDEN')
    const [first] = error.response.errors ?? []
    const code = typeof first?.extensions?.['code'] === 'string' ? first.extensions['code'] : undefined
    if (code === 'FORBIDDEN' || code === 'UNAUTHENTICATED') return new RevokeError('FORBIDDEN', first?.message)
    if (code === 'NOT_FOUND') return new RevokeError('NOT_FOUND', first?.message)
    return new RevokeError('UNKNOWN', first?.message ?? `HTTP ${error.response.status}`)
  }
  return new RevokeError('NETWORK', error instanceof Error ? error.message : String(error))
}

/** renown_revokeCredential with a bearer (Authorization header) or a signature; throws RevokeError. */
export async function sendRevoke(credentialId: string, auth: RevokeAuth): Promise<void> {
  const client = new GraphQLClient(SWITCHBOARD_ENDPOINT, {
    headers: 'bearer' in auth ? { Authorization: `Bearer ${auth.bearer}` } : {},
  })
  let revoked: boolean | null
  try {
    const data = await client.request<{ renown_revokeCredential: boolean | null }>(REVOKE, {
      credentialId,
      ...('bearer' in auth ? {} : { signature: auth.signature, timestamp: auth.timestamp }),
    })
    revoked = data.renown_revokeCredential
  } catch (error) {
    throw toRevokeError(error)
  }
  if (!revoked) throw new RevokeError('UNKNOWN', 'The switchboard did not confirm the revocation')
}
