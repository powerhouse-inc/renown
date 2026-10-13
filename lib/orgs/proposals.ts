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
export function proposalSummary(p: OrgProposal, appName: (did: string) => string = shortDid): string {
  const q = p.payload
  const who = q.address ? shortAddress(q.address) : null
  const app = q.appDid ? appName(q.appDid) : 'an app'
  switch (p.kind) {
    case 'ADD_OWNER':
      return `Make ${who ?? 'a member'} an owner`
    case 'REMOVE_OWNER':
      return q.demoteToAdmin ? `Demote ${who ?? 'an owner'} to admin` : `Remove ${who ?? 'an owner'} from the organisation`
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
  if (p.executableAt === null) {
    if (t >= expires) return { stage: 'expired' }
    const current = new Set(owners.map(lower))
    const need = Math.max(p.threshold, Math.min(2, current.size))
    const have = new Set(p.approvals.map(lower).filter((a) => current.has(a))).size
    return { stage: 'approvals', missing: Math.max(1, need - have), have, need }
  }
  const at = Date.parse(p.executableAt)
  // Matured after its expiry: it can never run (A2 ruling 1).
  if (at > expires) return { stage: 'expired' }
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
  if (hours > 0) return minutes > 0 ? `${unit(hours, 'hour')} ${unit(minutes, 'minute')}` : unit(hours, 'hour')
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
export function canApprove(p: OrgProposal, viewer: string, role: OrgRole): boolean {
  return role === 'OWNER' && p.status === 'PENDING' && p.kind !== 'RECOVER' && p.executableAt === null && !p.approvals.map(lower).includes(lower(viewer))
}

/** Any owner cancels; the proposer may always withdraw their own. */
export function canCancel(p: OrgProposal, viewer: string, role: OrgRole): boolean {
  return p.status === 'PENDING' && (role === 'OWNER' || lower(p.proposer) === lower(viewer))
}

export function canExecute(p: OrgProposal, viewer: string, role: OrgRole, now: Date): boolean {
  // Past approvals, the stage does not depend on the owner list.
  return canCancel(p, viewer, role) && proposalStage(p, now, []).stage === 'ready'
}
