// Who may do what to whom on the members page (renown-package A1 ruling 11),
// and the invite helpers. The switchboard decides; the UI hides what it would
// refuse. Pure.
import { formatRelative } from '../../utils/relative-time'
import type { OrgRole } from '../../services/org-signed-messages'
import { normalizeOrgHandle, ORG_HANDLE_RE } from './handles'

const RANK: Record<OrgRole, number> = { MEMBER: 0, PUBLISHER: 1, ADMIN: 2, OWNER: 3 }
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** Roles a viewer may invite with. */
export function inviteRoles(viewer: OrgRole): OrgRole[] {
  if (viewer === 'OWNER') return ['MEMBER', 'PUBLISHER', 'ADMIN']
  if (viewer === 'ADMIN') return ['MEMBER', 'PUBLISHER']
  return []
}

/** Invite links grant at most PUBLISHER. */
export const LINK_ROLES: OrgRole[] = ['MEMBER', 'PUBLISHER']

/** Roles a viewer may set on a member of role `target` (empty: no control). Owners change only through proposals. */
export function assignableRoles(viewer: OrgRole, target: OrgRole): OrgRole[] {
  if (target === 'OWNER') return []
  if (viewer === 'OWNER') return ['MEMBER', 'PUBLISHER', 'ADMIN']
  if (viewer === 'ADMIN' && target !== 'ADMIN') return ['MEMBER', 'PUBLISHER']
  return []
}

export function canRemove(viewer: OrgRole, target: OrgRole): boolean {
  if (target === 'OWNER') return false
  return viewer === 'OWNER' || (viewer === 'ADMIN' && RANK[target] <= RANK.PUBLISHER)
}

export function canRevokeInvite(viewer: OrgRole, inviteRole: OrgRole): boolean {
  return viewer === 'OWNER' || (viewer === 'ADMIN' && RANK[inviteRole] <= RANK.PUBLISHER)
}

/** An invitee as the switchboard takes it: a lowercase address or a handle. */
export function parseInvitee(raw: string): { invitee: string } | { problem: string } {
  const text = raw.trim()
  if (/^0x[0-9a-fA-F]{40}$/.test(text)) return { invitee: text.toLowerCase() }
  const handle = normalizeOrgHandle(text)
  if (ORG_HANDLE_RE.test(handle)) return { invitee: handle }
  return { problem: 'Enter a 0x wallet address or a Renown handle.' }
}

export const LINK_EXPIRY_DAYS = [1, 7, 14, 30] as const

/** `days` from `now`; the 30-day choice stays 10 minutes inside the switchboard's 30-day limit. */
export function linkExpiresAt(days: number, now: Date): string {
  const ms = days * DAY - (days >= 30 ? 10 * MINUTE : 0)
  return new Date(now.getTime() + ms).toISOString()
}

export function linkUsesProblem(raw: string): string | null {
  const uses = Number(raw)
  return raw.trim() !== '' && Number.isInteger(uses) && uses >= 1 && uses <= 100
    ? null
    : 'Use a whole number from 1 to 100.'
}

/** "Expires in 6 days" or "Expired". */
export function expiryText(expiresAt: string, now: Date): string {
  return Date.parse(expiresAt) <= now.getTime()
    ? 'Expired'
    : `Expires ${formatRelative(expiresAt, now)}`
}
