// /verify's organisation reads: the rules verdict for a credential id, the
// organisation that publishes an app DID, and an app's release attestations.
// Like the other lookups, only ids leave the browser.
import { switchboardOrigin } from '../../services/media'
import { SWITCHBOARD_ENDPOINT } from '../../services/switchboard-endpoint'
import { graphql } from './lookups'
import type { AppPublisherOrgRef, OrgCredentialVerdict, OrgLookups, StoredAttestation } from './types'

const ATTESTATION_FIELDS = 'id appDid version artifactDigest orgId signer signerRole signerStillMember issuedAt signature createdAt'

export function switchboardOrgLookups(endpoint = SWITCHBOARD_ENDPOINT): OrgLookups {
  const origin = switchboardOrigin(endpoint)
  const orgs = `${origin}/graphql/renown-orgs`
  const stats = `${origin}/graphql/renown-stats`
  return {
    async credentialStatus(credentialId) {
      const result = await graphql<{ orgCredentialStatus: OrgCredentialVerdict | null }>(
        orgs,
        'query VerifyOrgCredential($id: String!) { orgCredentialStatus(credentialId: $id) { appDid orgId counts reason } }',
        { id: credentialId },
      )
      return result.ok ? { ok: true, value: result.value.orgCredentialStatus ?? null } : result
    },
    async appPublisherOrg(appDid) {
      const result = await graphql<{ appProfile: { publisherOrg: AppPublisherOrgRef | null } | null }>(
        stats,
        'query VerifyAppPublisherOrg($appDid: String!) { appProfile(appDid: $appDid) { publisherOrg { id did handle name verifiedDomains } } }',
        { appDid },
      )
      return result.ok ? { ok: true, value: result.value.appProfile?.publisherOrg ?? null } : result
    },
    async releaseAttestation(id) {
      const result = await graphql<{ releaseAttestation: StoredAttestation | null }>(
        orgs,
        `query VerifyReleaseAttestation($id: String!) { releaseAttestation(id: $id) { ${ATTESTATION_FIELDS} } }`,
        { id },
      )
      return result.ok ? { ok: true, value: result.value.releaseAttestation ?? null } : result
    },
    async releaseAttestations(appDid) {
      const result = await graphql<{ releaseAttestations: { items: StoredAttestation[] } }>(
        orgs,
        `query VerifyReleaseAttestations($appDid: String!) { releaseAttestations(appDid: $appDid, limit: 50) { items { ${ATTESTATION_FIELDS} } } }`,
        { appDid },
      )
      return result.ok ? { ok: true, value: result.value.releaseAttestations.items } : result
    },
  }
}
