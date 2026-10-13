// Paths and wording for organisations, shared by pages and components. Pure.
import type { OrgRole } from '../../services/org-signed-messages'

export const ROLE_LABELS: Record<OrgRole, string> = { OWNER: 'Owner', ADMIN: 'Admin', PUBLISHER: 'Publisher', MEMBER: 'Member' }

export function roleLabel(role: string): string {
  return Object.hasOwn(ROLE_LABELS, role) ? ROLE_LABELS[role as OrgRole] : role
}

/** The canonical page of an organisation. */
export function orgPath(handle: string): string {
  return `/@${encodeURIComponent(handle)}`
}

export function manageHref(handle: string, section = 'members'): string {
  return `/org/${encodeURIComponent(handle)}/manage/${section}`
}

export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString('en-GB')} ${count === 1 ? one : many}`
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** How a member is named: display name, then @handle, then the short address. */
export function memberLabel(member: { displayName?: string | null; handle?: string | null; address: string }): string {
  return member.displayName?.trim() || (member.handle ? `@${member.handle}` : shortAddress(member.address))
}

export function memberHref(member: { handle?: string | null; address: string }): string {
  return member.handle ? `/@${member.handle}` : `/profile/${member.address}`
}

export function inviteLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/invite/${token}`
}

export function shortDid(did: string): string {
  return did.length > 28 ? `${did.slice(0, 18)}…${did.slice(-6)}` : did
}
