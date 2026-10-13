// Proposals as the security section shows them (renown-package A2 ruling 1):
// what each would do, where it stands, and who may act on it. Pure.
import type { OrgProposal, OrgProposalKind, OrgProposalStatus, OrgRole } from '../../services/orgs'
import { shortAddress, shortDid } from './format'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const PROPOSAL_KIND_LABELS: Record<OrgProposalKind, string> = {
  ADD_OWNER: 'Add an owner',
  REMOVE_OWNER: 'Remove an owner',
  TRANSFER_APP_OUT: 'Transfer an app out',
  CHANGE_HANDLE: 'Change the handle',
  DELETE_ORG: 'Delete the organisation',
  RECOVER: 'Recover the organisation',
  FREEZE_APP: 'Freeze an app',
  UNFREEZE_APP: 'Unfreeze an app',
}

export const PROPOSAL_STATUS_LABELS: Record<OrgProposalStatus, string> = {
  PENDING: 'Pending',
  EXECUTED: 'Carried out',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  FAILED: 'Failed',
}

/** One line on what the proposal would do. `appName` names an app DID when the caller knows it. */
export function proposalSummary(
  p: OrgProposal,
  appName: (did: string) => string = shortDid,
): string {
  const q = p.payload
  const who = q.address ? shortAddress(q.address) : null
  const app = q.appDid ? appName(q.appDid) : 'an app'
  switch (p.kind) {
    case 'ADD_OWNER':
      return `Make ${who ?? 'a member'} an owner`
    case 'REMOVE_OWNER':
      return q.demoteToAdmin
        ? `Demote ${who ?? 'an owner'} to admin`
        : `Remove ${who ?? 'an owner'} from the organisation`
    case 'TRANSFER_APP_OUT':
      return `Transfer ${app} to ${q.toKind === 'ORG' ? 'another organisation' : q.toId ? shortAddress(q.toId) : 'someone else'}`
    case 'CHANGE_HANDLE':
      return `Change the handle to @${q.handle ?? '…'}`
    case 'DELETE_ORG':
      return 'Delete the organisation'
    case 'RECOVER':
      return `Recover the organisation for ${who ?? 'a new owner'} through ${q.domain ?? 'a verified domain'}`
    case 'FREEZE_APP':
      return `Freeze ${app}`
    case 'UNFREEZE_APP':
      return `Unfreeze ${app}`
  }
}

const lower = (value: string) => value.toLowerCase()

/** The element id of one proposal on the security page; the apps section links "Proposal pending" to it. */
export function proposalAnchor(id: string): string {
  return `proposal-${id}`
}

export type ProposalStage =
  | { stage: 'approvals'; missing: number; have: number; need: number }
  | { stage: 'waiting'; until: string }
  | { stage: 'ready' }
  | { stage: 'expired' }
  | { stage: 'closed' }

/**
 * Where a proposal stands at `now`: still collecting approvals, waiting out its delay, ready to run, or past it.
 * Only approvals by current owners count, against max(stored threshold, min(2, owner count)) (switchboard core/proposals.ts).
 */
export function proposalStage(p: OrgProposal, now: Date, owners: string[]): ProposalStage {
  if (p.status !== 'PENDING') return { stage: 'closed' }
  const t = now.getTime()
  const expires = Date.parse(p.expiresAt)
  if (t >= expires) return { stage: 'expired' }
  // Recovery has threshold 0: it never collects approvals, it only waits out its delay. Without a delay there is nothing to show.
  if (p.kind === 'RECOVER' && p.executableAt === null) return { stage: 'closed' }
  if (p.executableAt === null) {
    if (t >= expires) return { stage: 'expired' }
    const current = new Set(owners.map(lower))
    const need = Math.max(p.threshold, Math.min(2, current.size))
    const have = new Set(p.approvals.map(lower).filter((a) => current.has(a))).size
    return { stage: 'approvals', missing: Math.max(1, need - have), have, need }
  }
  const at = Date.parse(p.executableAt)
  // Matured after its expiry: it can never run (A2 ruling 1).
  if (at >= expires) return { stage: 'expired' }
  return at > t ? { stage: 'waiting', until: p.executableAt } : { stage: 'ready' }
}

function unit(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** "1 day 4 hours", "2 hours 5 minutes", "12 minutes", "less than a minute", "now". */
export function countdown(untilIso: string, now: Date): string {
  const ms = Date.parse(untilIso) - now.getTime()
  if (ms <= 0) return 'now'
  if (ms < MINUTE) return 'less than a minute'
  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / HOUR)
  const minutes = Math.floor((ms % HOUR) / MINUTE)
  if (days > 0) return hours > 0 ? `${unit(days, 'day')} ${unit(hours, 'hour')}` : unit(days, 'day')
  if (hours > 0)
    return minutes > 0 ? `${unit(hours, 'hour')} ${unit(minutes, 'minute')}` : unit(hours, 'hour')
  return unit(minutes, 'minute')
}

export function stageText(stage: ProposalStage, now: Date): string {
  switch (stage.stage) {
    case 'approvals':
      return `Needs ${stage.missing} more owner approval${stage.missing === 1 ? '' : 's'}`
    case 'waiting':
      return `Can run in ${countdown(stage.until, now)}`
    case 'ready':
      return 'Ready to run'
    case 'expired':
      return 'Expired'
    case 'closed':
      return ''
  }
}

/** Owners approve proposals that still need approvals and that they have not approved. */
export function canApprove(p: OrgProposal, viewer: string, role: OrgRole, now: Date): boolean {
  return (
    role === 'OWNER' &&
    p.status === 'PENDING' &&
    p.kind !== 'RECOVER' &&
    p.executableAt === null &&
    now.getTime() < Date.parse(p.expiresAt) &&
    !p.approvals.map(lower).includes(lower(viewer))
  )
}

/** Any owner cancels; the proposer may always withdraw their own. */
export function canCancel(p: OrgProposal, viewer: string, role: OrgRole): boolean {
  return p.status === 'PENDING' && (role === 'OWNER' || lower(p.proposer) === lower(viewer))
}

export function canExecute(p: OrgProposal, viewer: string, role: OrgRole, now: Date): boolean {
  // Past approvals, the stage does not depend on the owner list.
  return canCancel(p, viewer, role) && proposalStage(p, now, []).stage === 'ready'
}

/** Kinds whose Approve and Run now ask first: they remove, delete, move, freeze or rename something. */
export const CONFIRMED_KINDS: readonly OrgProposalKind[] = [
  'DELETE_ORG',
  'REMOVE_OWNER',
  'TRANSFER_APP_OUT',
  'FREEZE_APP',
  'CHANGE_HANDLE',
  'RECOVER',
]

/** How a confirmation names the organisation, apps and people, and who is looking. */
export interface ConfirmNames {
  org: string
  app: (did: string) => string
  person: (address: string) => string
  /** The viewer's address. */
  viewer: string
}

export interface ProposalConfirmation {
  title: string
  body: string
  /** A sharper warning when the action touches the viewer's own ownership or hands the organisation to someone. */
  warning: string | null
  confirm: string
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** What a proposal does once it runs, as [short verb phrase, consequence]. */
function proposalEffect(p: OrgProposal, n: ConfirmNames): [string, string] {
  const q = p.payload
  const person = q.address ? n.person(q.address) : 'an owner'
  const app = q.appDid ? n.app(q.appDid) : 'the app'
  switch (p.kind) {
    case 'DELETE_ORG':
      return [
        `delete ${n.org}`,
        `${n.org} is archived for good: every member is removed, its invite links and pending proposals end, and nothing about it can be changed again. This cannot be undone.`,
      ]
    case 'REMOVE_OWNER':
      return q.demoteToAdmin
        ? [
            `demote ${person} to admin`,
            `${person} stops being an owner of ${n.org} and becomes an admin.`,
          ]
        : [
            `remove ${person} from ${n.org}`,
            `${person} leaves ${n.org}, and their delegations for its apps are suspended.`,
          ]
    case 'TRANSFER_APP_OUT': {
      const to =
        q.toKind === 'ORG' ? 'another organisation' : q.toId ? n.person(q.toId) : 'the recipient'
      return [
        `transfer ${app} out of ${n.org}`,
        `${app} is offered to ${to}. Once they accept, ${n.org} no longer publishes it.`,
      ]
    }
    case 'FREEZE_APP':
      return [
        `freeze ${app}`,
        `${app}’s delegations stop counting and it gets no tokens until it is unfrozen.`,
      ]
    case 'CHANGE_HANDLE':
      return [
        `change the handle of ${n.org} to @${q.handle ?? '…'}`,
        `${n.org} moves to @${q.handle ?? '…'}. Links that use its current handle may stop working.`,
      ]
    case 'RECOVER':
      return [
        `recover ${n.org} for ${person}`,
        `${person} becomes an owner of ${n.org} through ${q.domain ?? 'a verified domain'}, with an owner’s say over every high-risk change.`,
      ]
    default:
      return [lower(proposalSummary(p)), '']
  }
}

/** The confirmation an Approve or Run now asks for, or null when the kind runs on one click. */
export function proposalConfirmation(
  p: OrgProposal,
  action: 'approve' | 'execute',
  n: ConfirmNames,
): ProposalConfirmation | null {
  if (!CONFIRMED_KINDS.includes(p.kind)) return null
  const [short, effect] = proposalEffect(p, n)
  const q = p.payload
  const self = q.address !== null && lower(q.address) === lower(n.viewer)
  let warning: string | null = null
  if (p.kind === 'REMOVE_OWNER' && self) warning = `This ends your own ownership of ${n.org}.`
  if (p.kind === 'RECOVER' && !self)
    warning = `You are an owner of ${n.org}, and this hands it to someone else. Run it only if you expected this recovery; if you did not, cancel it instead.`
  if (action === 'execute') {
    return {
      title: `${capitalise(short)} now?`,
      body: `It runs now. ${effect}`,
      warning,
      confirm: `Yes, ${short} now`,
    }
  }
  const after =
    p.kind === 'FREEZE_APP'
      ? 'If yours is the last approval needed, it can run straight away, and Renown runs it shortly if no owner does.'
      : 'If yours is the last approval needed, it runs when its waiting period ends: an owner runs it, or Renown does shortly after.'
  return {
    title: `Approve: ${short}?`,
    body: `${effect} ${after}`,
    warning,
    confirm: `Yes, approve: ${short}`,
  }
}
