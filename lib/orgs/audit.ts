// The audit log as people read it. Pure.
import { shortAddress } from './format'

// Every action renown-orgs writes (derived from its rt.record calls).
const ACTIONS: Record<string, string> = {
  createOrganization: 'Created the organisation',
  updateOrganization: 'Changed the profile',
  setOrgListed: 'Changed the directory listing',
  inviteOrgMember: 'Invited a member',
  respondToOrgInvite: 'Answered an invite',
  revokeOrgInvite: 'Revoked an invite',
  createOrgInviteLink: 'Created an invite link',
  revokeOrgInviteLink: 'Revoked an invite link',
  acceptOrgInviteLink: 'Joined by invite link',
  leaveOrganization: 'Left',
  removeOrgMember: 'Removed a member',
  setOrgMemberRole: 'Changed a role',
  setOrgMemberAppScope: 'Changed app access',
  setMyOrgMembershipHidden: 'Changed their visibility',
  createOrgTeam: 'Created a team',
  updateOrgTeam: 'Changed a team',
  deleteOrgTeam: 'Deleted a team',
  setOrgTeamMembers: 'Changed team members',
  proposeOrgChange: 'Made a proposal',
  startOrgRecovery: 'Started a recovery',
  approveOrgProposal: 'Approved a proposal',
  cancelOrgProposal: 'Cancelled a proposal',
  executeOrgProposal: 'Ran a proposal',
  expireOrgProposal: 'Expired a proposal',
  'proposal.ADD_OWNER': 'Added an owner (proposal)',
  'proposal.REMOVE_OWNER': 'Removed an owner (proposal)',
  'proposal.TRANSFER_APP_OUT': 'Transferred an app out (proposal)',
  'proposal.CHANGE_HANDLE': 'Changed the handle (proposal)',
  'proposal.DELETE_ORG': 'Deleted the organisation (proposal)',
  'proposal.DELETE_ORG.cancel': 'Cancelled the deletion (proposal)',
  'proposal.RECOVER': 'Recovered the organisation (proposal)',
  'proposal.FREEZE_APP': 'Froze an app (proposal)',
  'proposal.UNFREEZE_APP': 'Unfroze an app (proposal)',
  addOrgDomain: 'Added a domain',
  checkOrgDomain: 'Checked a domain',
  removeOrgDomain: 'Removed a domain',
  domainLapsed: 'A verified domain lapsed',
  proposeAppTransfer: 'Proposed an app transfer',
  acceptAppTransfer: 'Accepted an app transfer',
  declineAppTransfer: 'Declined an app transfer',
  cancelAppTransfer: 'App changed owner',
  expireAppTransfer: 'An app transfer expired',
  attachApp: 'Added an app',
  detachApp: 'Removed an app',
  suspendOrgCredentials: 'Suspended delegations',
  suspendOnExit: 'Suspended a departed member’s delegations',
  convertMemberSuspension: 'Converted a member suspension',
  memberCredentialsSuspended: 'Suspended a member’s delegations',
  liftMemberSuspension: 'Lifted a member suspension',
  unsuspendOrgCredential: 'Lifted a suspension',
  delegationAdded: 'A delegation was added',
  setOrgWorkloadDisabled: 'Changed a service account',
  createOrgWebhook: 'Added a webhook',
  updateOrgWebhook: 'Changed a webhook',
  deleteOrgWebhook: 'Deleted a webhook',
  webhookDisabled: 'A webhook was disabled after repeated failures',
  registerOrgOidcClient: 'Registered a sign-in client',
  updateOrgOidcClient: 'Changed a sign-in client',
  rotateOrgOidcClientSecret: 'Rotated a client secret',
  attestRelease: 'Signed off a release',
  'moderation.takenDown': 'Taken down by Renown',
  'moderation.restored': 'Restored by Renown',
  'moderation.handleReleased': 'Handle released by Renown',
}

/** "Invited a member"; "system.<action>" reads "<action text> (automatically)"; unknown actions as they are. */
export function auditActionText(action: string): string {
  const system = action.startsWith('system.')
  const key = system ? action.slice('system.'.length) : action
  if (!Object.hasOwn(ACTIONS, key)) return action
  const text = ACTIONS[key]
  return system ? `${text} (automatically)` : text
}

function valueText(value: unknown): string {
  if (typeof value === 'string')
    return /^0x[0-9a-fA-F]{40}$/.test(value) ? shortAddress(value.toLowerCase()) : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'none'
  return JSON.stringify(value)
}

/** The details object as "key value, key value", clipped to `max` characters. */
export function auditDetailsText(details: string, max = 160): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(details)
  } catch {
    return details.slice(0, max)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    return valueText(parsed).slice(0, max)
  const text = Object.entries(parsed as Record<string, unknown>)
    .map(([key, value]) => `${key} ${valueText(value)}`)
    .join(', ')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function auditFileName(handle: string, now: Date): string {
  return `renown-${handle}-audit-${now.toISOString().slice(0, 10)}.json`
}
