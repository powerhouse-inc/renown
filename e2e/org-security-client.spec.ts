import { test, expect } from '@playwright/test'
import { parse } from 'graphql'
import { canUnsuspend, credentialStateText } from '../lib/orgs/credentials'
import { canApprove, canCancel, canExecute, countdown, proposalStage, proposalSummary, stageText } from '../lib/orgs/proposals'
import { partyText, personTransfers, transferDirection } from '../lib/orgs/transfers'
import type { OrgProposal } from '../services/orgs'
import { argsProblem, mutationDocument, ORG_MUTATIONS, type OrgMutationName } from '../services/org-mutations'
import { APP_DID_A, appTransfer, orgCredential, orgDelivery, orgProposal } from './support/org-fixtures'

const OWNER = '0x0a000000000000000000000000000000000000a1'
const OTHER = '0x0b000000000000000000000000000000000000b2'
const OWNERS = [OWNER, OTHER]
const now = new Date('2026-10-12T12:00:00.000Z')

test.describe('proposals', () => {
  test('stages: approvals, waiting, ready, expired', () => {
    const base = orgProposal({ orgId: 'o', createdAt: '2026-10-12T00:00:00.000Z', expiresAt: '2026-10-26T00:00:00.000Z', threshold: 2, approvals: [OWNER] })
    expect(proposalStage(base, now, OWNERS)).toEqual({ stage: 'approvals', missing: 1, have: 1, need: 2 })
    expect(stageText(proposalStage(base, now, OWNERS), now)).toBe('Needs 1 more owner approval')
    const waiting = { ...base, executableAt: '2026-10-13T16:30:00.000Z' }
    expect(proposalStage(waiting, now, OWNERS)).toEqual({ stage: 'waiting', until: '2026-10-13T16:30:00.000Z' })
    expect(stageText(proposalStage(waiting, now, OWNERS), now)).toBe('Can run in 1 day 4 hours')
    expect(proposalStage({ ...base, executableAt: '2026-10-12T11:00:00.000Z' }, now, OWNERS)).toEqual({ stage: 'ready' })
    expect(proposalStage({ ...base, expiresAt: '2026-10-12T11:00:00.000Z' }, now, OWNERS)).toEqual({ stage: 'expired' })
    expect(proposalStage({ ...base, executableAt: '2026-10-27T00:00:00.000Z' }, now, OWNERS)).toEqual({ stage: 'expired' })
    expect(proposalStage({ ...base, status: 'EXECUTED' }, now, OWNERS)).toEqual({ stage: 'closed' })
  })

  test('only current owners approvals count, against max(threshold, min(2, owners))', () => {
    const p = orgProposal({ orgId: 'o', threshold: 1, approvals: [OWNER, '0x0c000000000000000000000000000000000000c3'], expiresAt: '2026-10-26T00:00:00.000Z' })
    // Two owners: the floor of two applies even though the stored threshold is 1; a departed owner's approval is ignored.
    expect(proposalStage(p, now, [OTHER, OWNER])).toEqual({ stage: 'approvals', missing: 1, have: 1, need: 2 })
    expect(proposalStage(p, now, [OWNER.toUpperCase().replace('0X', '0x'), OTHER, '0x0c000000000000000000000000000000000000c3'])).toEqual({ stage: 'approvals', missing: 1, have: 2, need: 2 })
    // A single owner needs only the stored threshold.
    expect(proposalStage({ ...p, approvals: [] }, now, [OWNER])).toEqual({ stage: 'approvals', missing: 1, have: 0, need: 1 })
  })

  test('countdowns read like a person would say them', () => {
    expect(countdown('2026-10-12T12:00:30.000Z', now)).toBe('less than a minute')
    expect(countdown('2026-10-12T12:01:00.000Z', now)).toBe('1 minute')
    expect(countdown('2026-10-12T14:05:00.000Z', now)).toBe('2 hours 5 minutes')
    expect(countdown('2026-10-14T12:00:00.000Z', now)).toBe('2 days')
    expect(countdown('2026-10-12T11:00:00.000Z', now)).toBe('now')
  })

  test('who may approve, cancel and execute', () => {
    const p = orgProposal({ orgId: 'o', proposer: OWNER, approvals: [OWNER], threshold: 2, expiresAt: '2026-10-26T00:00:00.000Z' })
    expect(canApprove(p, OWNER, 'OWNER')).toBe(false)
    expect(canApprove(p, OTHER, 'OWNER')).toBe(true)
    expect(canApprove(p, OTHER, 'ADMIN')).toBe(false)
    expect(canCancel(p, OTHER, 'ADMIN')).toBe(false)
    expect(canCancel(p, OWNER, 'ADMIN')).toBe(true)
    expect(canExecute(p, OWNER, 'OWNER', now)).toBe(false)
    expect(canExecute({ ...p, executableAt: '2026-10-12T11:00:00.000Z' }, OTHER, 'OWNER', now)).toBe(true)
  })

  test('summaries name the change', () => {
    const blank: OrgProposal['payload'] = { address: null, demoteToAdmin: null, appDid: null, toKind: null, toId: null, handle: null, domain: null }
    const p = (kind: Parameters<typeof orgProposal>[0]['kind'], payload: Partial<typeof blank>) => orgProposal({ orgId: 'o', kind, payload: { ...blank, ...payload } })
    expect(proposalSummary(p('ADD_OWNER', { address: OTHER }))).toBe('Make 0x0b00…00b2 an owner')
    expect(proposalSummary(p('REMOVE_OWNER', { address: OTHER, demoteToAdmin: true }))).toBe('Demote 0x0b00…00b2 to admin')
    expect(proposalSummary(p('REMOVE_OWNER', { address: OTHER, demoteToAdmin: false }))).toBe('Remove 0x0b00…00b2 from the organisation')
    expect(proposalSummary(p('CHANGE_HANDLE', { handle: 'acme-two' }))).toBe('Change the handle to @acme-two')
    expect(proposalSummary(p('FREEZE_APP', { appDid: APP_DID_A }), () => 'Acme Ledger')).toBe('Freeze Acme Ledger')
    expect(proposalSummary(p('TRANSFER_APP_OUT', { appDid: APP_DID_A, toKind: 'PERSON', toId: OTHER }), () => 'Acme Ledger')).toBe('Transfer Acme Ledger to 0x0b00…00b2')
    expect(proposalSummary(p('RECOVER', { address: OTHER, domain: 'acme.example' }))).toBe('Recover the organisation for 0x0b00…00b2 through acme.example')
  })
})

test.describe('credentials and transfers', () => {
  test('a credential says whether it counts and why not', () => {
    expect(credentialStateText(orgCredential({}))).toBe('Counts')
    expect(credentialStateText(orgCredential({ revoked: true }))).toBe('Revoked by its issuer')
    const suspended = orgCredential({ status: { credentialId: 'c1', appDid: APP_DID_A, orgId: 'o', counts: false, reason: 'SUSPENDED' } })
    expect(credentialStateText(suspended)).toBe('Suspended by the organisation')
    expect(canUnsuspend(suspended)).toBe(true)
    expect(credentialStateText(orgCredential({ status: { credentialId: 'c1', appDid: APP_DID_A, orgId: 'o', counts: false, reason: 'ISSUER_NOT_MEMBER' } }))).toBe(
      'Its issuer is no longer a member',
    )
  })

  test('transfers in, out and to a person', () => {
    const incoming = appTransfer({ id: 't1', fromKind: 'PERSON', fromId: OTHER, toKind: 'ORG', toId: 'org-1' })
    const outgoing = appTransfer({ id: 't2', fromKind: 'ORG', fromId: 'org-1', toKind: 'PERSON', toId: OTHER })
    expect(transferDirection(incoming, 'org-1')).toBe('in')
    expect(transferDirection(outgoing, 'org-1')).toBe('out')
    expect(transferDirection(outgoing, 'org-2')).toBeNull()
    expect(personTransfers([incoming, outgoing, { ...outgoing, id: 't3', status: 'ACCEPTED' }], OTHER)).toEqual({ incoming: [outgoing], outgoing: [incoming] })
    expect(partyText('PERSON', OTHER)).toBe('0x0b00…00b2')
    expect(partyText('ORG', 'org-1')).toBe('an organisation')
  })
})

test.describe('fixtures', () => {
  test('a delivery can be paused while the organisation is taken down', () => {
    expect(orgDelivery({ status: 'PAUSED', deliveredAt: null }).status).toBe('PAUSED')
  })
})

test.describe('B2 mutations', () => {
  test('are registered with their contract arguments and parse', () => {
    for (const name of Object.keys(ORG_MUTATIONS) as OrgMutationName[]) expect(() => parse(mutationDocument(name)), name).not.toThrow()
    expect(mutationDocument('suspendOrgCredentials')).toBe(
      'mutation SuspendOrgCredentials($orgId: String!, $credentialIds: [String!], $memberAddress: String, $auth: OrgAuthInput) { suspendOrgCredentials(orgId: $orgId, credentialIds: $credentialIds, memberAddress: $memberAddress, auth: $auth) }',
    )
    expect(argsProblem('acceptAppTransfer', { transferId: 't1' })).toBeNull()
    expect(argsProblem('resolveOrgReport', { reportId: 'r1' })).toBe('resolution')
    expect(argsProblem('createOrgWebhook', { orgId: 'o', url: 'https://hooks.example', events: ['member.joined'] })).toBeNull()
  })
})
