// Delegations under organisation rules (renown-package A2 ruling 11). Pure.
import type { OrgCredential, OrgCredentialReason } from '../../services/org-security'

export const CREDENTIAL_REASON_TEXT: Record<OrgCredentialReason, string> = {
  ISSUER_NOT_MEMBER: 'Its issuer is no longer a member',
  ISSUER_NOT_PUBLISHER: 'Its issuer may no longer publish this app',
  SUSPENDED: 'Suspended by the organisation',
  APP_FROZEN: 'The app is frozen',
}

export function credentialStateText(credential: OrgCredential): string {
  if (credential.revoked) return 'Revoked by its issuer'
  if (credential.status.counts) return 'Counts'
  return credential.status.reason ? CREDENTIAL_REASON_TEXT[credential.status.reason] : 'Does not count'
}

/** Only an explicit suspension can be lifted (the other reasons follow from membership or a freeze). */
export function canUnsuspend(credential: OrgCredential): boolean {
  return credential.status.reason === 'SUSPENDED'
}
