// What each inbox notification says and where it leads. Reads only the payload
// keys renown-package writes (A1 Task 7, A2 rulings 4 and 12, A3 ruling 2) and
// falls back to a plain sentence for anything else. Pure.
import type { OrgNotification, OrgProposalKind } from '../../services/orgs'
import { manageHref, orgPath, roleLabel, shortAddress } from './format'

type NotificationView = Pick<OrgNotification, 'kind' | 'org' | 'payload' | 'orgId'>

const PROPOSAL_TEXT: Record<OrgProposalKind, string> = {
  ADD_OWNER: 'add an owner',
  REMOVE_OWNER: 'remove an owner',
  TRANSFER_APP_OUT: 'transfer an app out',
  CHANGE_HANDLE: 'change the handle',
  DELETE_ORG: 'delete the organisation',
  RECOVER: 'recover the organisation',
  FREEZE_APP: 'freeze an app',
  UNFREEZE_APP: 'unfreeze an app',
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

function payloadOf(n: NotificationView): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(n.payload)
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function who(value: unknown): string {
  return typeof value === 'string' && ADDRESS_RE.test(value)
    ? shortAddress(value.toLowerCase())
    : 'Someone'
}

// The app DID shape (services/app-profiles APP_DID_RE), kept here so the inbox bundle stays free of the app reads.
const APP_DID_RE = /^did:key:z[1-9A-HJ-NP-Za-km-z]{32,128}$/

function proposalText(kind: unknown): string {
  return typeof kind === 'string' && Object.hasOwn(PROPOSAL_TEXT, kind)
    ? PROPOSAL_TEXT[kind as OrgProposalKind]
    : 'make a change'
}

export function notificationText(n: NotificationView): string {
  const p = payloadOf(n)
  const org = n.org?.name ?? 'an organisation'
  const Org = n.org?.name ?? 'An organisation'
  const proposal = proposalText(p.kind)
  switch (n.kind) {
    case 'INVITED':
      return `${Org} invited you to join as ${roleLabel(text(p.role) ?? 'MEMBER')}.`
    case 'INVITE_ACCEPTED':
      return `${who(p.address)} joined ${org} as ${roleLabel(text(p.role) ?? 'MEMBER')}.`
    case 'ROLE_CHANGED':
      return text(p.to)
        ? `Your role in ${org} is now ${roleLabel(text(p.to) ?? '')}.`
        : `Your role in ${org} changed.`
    case 'REMOVED':
      return `You were removed from ${org}.`
    case 'PROPOSAL_CREATED':
      return `A proposal to ${proposal} was made in ${org}.`
    case 'PROPOSAL_NEEDS_APPROVAL':
      return `A proposal to ${proposal} in ${org} needs your approval.`
    case 'PROPOSAL_EXECUTED': {
      const reason = text(p.reason)
      if (reason || p.status === 'FAILED')
        return `The proposal to ${proposal} in ${org} failed${reason ? `: ${reason}` : ''}.`
      return `The proposal to ${proposal} in ${org} was carried out.`
    }
    case 'PROPOSAL_CANCELLED':
      return p.status === 'EXPIRED'
        ? `The proposal to ${proposal} in ${org} expired.`
        : `The proposal to ${proposal} in ${org} was cancelled.`
    case 'RECOVERY_STARTED':
      return `Someone started recovering ${org}${text(p.domain) ? ` through ${text(p.domain)}` : ''}. Any owner can cancel it before it takes effect.`
    case 'APP_TRANSFER_REQUEST':
      return text(p.from) === n.orgId
        ? `${Org} wants to transfer an app to you.`
        : `An app transfer to ${org} is waiting for a decision.`
    case 'APP_TRANSFER_DONE':
      return `An app transfer involving ${org} is complete.`
    case 'APP_FROZEN':
      return `An app of ${org} was frozen.`
    case 'DOMAIN_LAPSED':
      return `${text(p.domain) ?? 'A domain'} is no longer verified for ${org}.`
    case 'DELEGATION_ADDED':
      return `${who(p.issuer)} authorised a key for an app of ${org}.`
    default:
      return `Something changed in ${org}.`
  }
}

export function notificationHref(n: NotificationView): string {
  const p = payloadOf(n)
  if (n.kind === 'INVITED') return '/me#organisations'
  // A transfer out of the organisation to a person: the person decides on /me.
  if (n.kind === 'APP_TRANSFER_REQUEST' && text(p.from) === n.orgId) return '/me#app-transfers'
  const handle = n.org?.handle
  if (!handle) return '/notifications'
  switch (n.kind) {
    case 'INVITE_ACCEPTED':
    case 'ROLE_CHANGED':
      return manageHref(handle, 'members')
    case 'PROPOSAL_CREATED':
    case 'PROPOSAL_NEEDS_APPROVAL':
    case 'PROPOSAL_EXECUTED':
    case 'PROPOSAL_CANCELLED':
    case 'RECOVERY_STARTED':
    case 'DELEGATION_ADDED':
      return manageHref(handle, 'security')
    case 'APP_TRANSFER_DONE': {
      // A person on either side is told too, and cannot open the manage pages: anyone can
      // open the app's own page, which shows its publisher now.
      const person = [p.from, p.to].some((party) => typeof party === 'string' && ADDRESS_RE.test(party))
      if (!person) return manageHref(handle, 'apps')
      const appDid = text(p.appDid)
      return appDid && APP_DID_RE.test(appDid) ? `/app/${appDid}` : orgPath(handle)
    }
    case 'APP_TRANSFER_REQUEST':
    case 'APP_FROZEN':
      return manageHref(handle, 'apps')
    case 'DOMAIN_LAPSED':
      return manageHref(handle, 'domains')
    default:
      return orgPath(handle)
  }
}
