// The public reads /verify makes from the browser: a credential by id, the
// credentials an address issued to an app key, a profile by address and an
// app profile by DID. Only these ids and addresses leave the browser, never
// the pasted credential, token or operation.
import { switchboardOrigin } from '../../services/media'
import { SWITCHBOARD_ENDPOINT } from '../../services/switchboard-endpoint'
import { CLIENT_DATA_TIMEOUT_MS } from '../../utils/with-timeout'
import type { AppPartyProfile, Lookup, PartyProfile, StoredCredential, StoredCredentialFull, VerifyLookups } from './types'

const STATUS_FIELDS = 'credentialId issuerEthereumAddress credentialSubjectId credentialSubjectApp issuanceDate expirationDate revoked revokedAt revocationReason'
const FULL_FIELDS = `${STATUS_FIELDS} context type issuerId credentialSchemaId credentialSchemaType proofValue proofEthereumAddress proofEip712Domain`

async function graphql<T>(endpoint: string, query: string, variables: Record<string, unknown>): Promise<Lookup<T>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLIENT_DATA_TIMEOUT_MS)
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false }
    const body = (await res.json()) as { data?: T | null; errors?: unknown[] }
    if (body.errors?.length || !body.data) return { ok: false }
    return { ok: true, value: body.data }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}

function map<T, U>(result: Lookup<T>, fn: (value: T) => U): Lookup<U> {
  return result.ok ? { ok: true, value: fn(result.value) } : result
}

export function switchboardLookups(endpoint = SWITCHBOARD_ENDPOINT): VerifyLookups {
  const stats = `${switchboardOrigin(endpoint)}/graphql/renown-stats`
  return {
    async credentialById(credentialId) {
      const result = await graphql<{ renownCredentials: StoredCredentialFull[] }>(
        endpoint,
        `query VerifyCredentialById($id: String!) { renownCredentials(input: { credentialId: $id }) { ${FULL_FIELDS} } }`,
        { id: credentialId },
      )
      return map(result, (data) => data.renownCredentials)
    },
    async credentialsFor(appDid, address) {
      const result = await graphql<{ renownCredentials: StoredCredential[] }>(
        endpoint,
        `query VerifyDelegation($did: String!, $address: String!) { renownCredentials(input: { did: $did, ethAddress: $address, includeRevoked: true }) { ${STATUS_FIELDS} } }`,
        { did: appDid, address },
      )
      return map(result, (data) => data.renownCredentials)
    },
    async profileByAddress(address) {
      const result = await graphql<{ renownUsers: PartyProfile[] }>(
        endpoint,
        `query VerifyProfile($address: String!) { renownUsers(input: { ethAddresses: [$address] }) { documentId handle displayName username avatar } }`,
        { address },
      )
      return map(result, (data) => data.renownUsers[0] ?? null)
    },
    async appProfile(appDid) {
      const result = await graphql<{ appProfile: AppPartyProfile | null }>(
        stats,
        `query VerifyApp($appDid: String!) { appProfile(appDid: $appDid) { documentId name logoRef } }`,
        { appDid },
      )
      return map(result, (data) => data.appProfile ?? null)
    },
  }
}
