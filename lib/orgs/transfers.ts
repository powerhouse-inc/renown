// App transfers as each side sees them (renown-package A2 ruling 12). Pure.
import type { AppTransfer } from '../../services/org-security'
import type { OrgPartyKind } from '../../services/orgs'
import { shortAddress } from './format'

/** 'in' when the organisation receives the app, 'out' when it gives it away. */
export function transferDirection(transfer: AppTransfer, orgId: string): 'in' | 'out' | null {
  if (transfer.toKind === 'ORG' && transfer.toId === orgId) return 'in'
  if (transfer.fromKind === 'ORG' && transfer.fromId === orgId) return 'out'
  return null
}

/** A wallet's pending transfers: apps offered to it, and apps it offered to an organisation. */
export function personTransfers(list: AppTransfer[], address: string): { incoming: AppTransfer[]; outgoing: AppTransfer[] } {
  const me = address.toLowerCase()
  const pending = list.filter((t) => t.status === 'PENDING')
  return {
    incoming: pending.filter((t) => t.toKind === 'PERSON' && t.toId.toLowerCase() === me),
    outgoing: pending.filter((t) => t.fromKind === 'PERSON' && t.fromId.toLowerCase() === me),
  }
}

export function partyText(kind: OrgPartyKind, id: string): string {
  return kind === 'PERSON' ? shortAddress(id.toLowerCase()) : 'an organisation'
}
