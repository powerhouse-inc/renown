// Invite links as the invite page explains them. Pure.
import type { OrgRole } from '../../services/org-signed-messages'

/** 32 random bytes in base64url are 43 characters; anything far off is not a token. */
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/

/** The invite page's Cache-Control: its URL carries a secret, so no cache may store it. */
export const INVITE_CACHE_CONTROL = 'private, no-store'

/** Sets the invite page's headers on every answer (preview, 404, 503): never stored by a cache, never passed on as a Referer. */
export function setInviteHeaders(res: { setHeader(name: string, value: string): unknown }): void {
  res.setHeader('Cache-Control', INVITE_CACHE_CONTROL)
  res.setHeader('Referrer-Policy', 'no-referrer')
}

export type InviteLinkState = 'usable' | 'expired' | 'revoked' | 'full'

export function inviteLinkState(preview: { usable: boolean; expired: boolean; revoked: boolean; full: boolean }): InviteLinkState {
  if (preview.revoked) return 'revoked'
  if (preview.expired) return 'expired'
  if (preview.full) return 'full'
  return preview.usable ? 'usable' : 'expired'
}

export const INVITE_STATE_TEXT: Record<Exclude<InviteLinkState, 'usable'>, string> = {
  expired: 'This invite link has expired. Ask the organisation for a new one.',
  revoked: 'This invite link was revoked. Ask the organisation for a new one.',
  full: 'This invite link has been used as many times as it allows. Ask the organisation for a new one.',
}

export const ROLE_MEANING: Record<OrgRole, string> = {
  MEMBER: 'Members see who else belongs, and apps that ask about your organisations learn that you are one.',
  PUBLISHER: 'Publishers also edit the apps they are given, authorise app keys for them and sign off releases.',
  ADMIN: 'Admins also manage members, teams, domains and settings.',
  OWNER: 'Owners also approve high-risk changes such as new owners and transfers.',
}
