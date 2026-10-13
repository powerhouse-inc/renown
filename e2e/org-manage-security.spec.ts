import { test, expect } from '@playwright/test'
import { shortDid } from '../lib/orgs/format'
import {
  APP_DID_A,
  orgCredential,
  orgMember,
  orgProposal,
  orgWorkload,
} from './support/org-fixtures'
import {
  BOB,
  CAROL,
  DAVE,
  OWNER,
  defaultMembers,
  openManagePage,
  signedWrite,
} from './support/org-manage'
import { fixtureStub, stubRequests } from './support/stub-switchboard-client'

const blank = {
  address: null,
  demoteToAdmin: null,
  appDid: null,
  toKind: null,
  toId: null,
  handle: null,
  domain: null,
}
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()
const DAY = 86_400_000

async function answer(orgId: string, name: string, value: unknown) {
  await fixtureStub({
    match: `mutation ${name}`,
    variables: orgId,
    response: { data: { [name.charAt(0).toLowerCase() + name.slice(1)]: value } },
  })
}

function proposals(orgId: string) {
  return [
    orgProposal({
      orgId,
      id: 'p-approve',
      kind: 'ADD_OWNER',
      payload: { ...blank, address: CAROL },
      // Proposed by an owner who has since left: their approval no longer counts.
      proposer: OWNER,
      approvals: [OWNER],
      threshold: 1,
      createdAt: iso(-DAY),
      expiresAt: iso(13 * DAY),
    }),
    orgProposal({
      orgId,
      id: 'p-wait',
      kind: 'CHANGE_HANDLE',
      payload: { ...blank, handle: 'acme-two' },
      proposer: OWNER,
      approvals: [OWNER],
      threshold: 1,
      executableAt: iso(DAY + 4 * 3_600_000 + 60_000),
      expiresAt: iso(13 * DAY),
    }),
    orgProposal({
      orgId,
      id: 'p-ready',
      kind: 'FREEZE_APP',
      payload: { ...blank, appDid: APP_DID_A },
      proposer: OWNER,
      approvals: [OWNER],
      threshold: 1,
      executableAt: iso(-60_000),
      expiresAt: iso(13 * DAY),
    }),
    orgProposal({
      orgId,
      id: 'p-done',
      kind: 'DELETE_ORG',
      status: 'CANCELLED',
      reason: 'Not now',
    }),
  ]
}

test.describe('manage: security', () => {
  test('an owner sees the single-owner warning, proposes an owner and approves, waits for and runs proposals', async ({
    page,
  }) => {
    const setup = await openManagePage(page, {
      role: 'OWNER',
      section: 'security',
      org: { securityWarnings: ['SINGLE_OWNER'], ownerCount: 1 },
      // A single-owner organisation: the viewer is its only owner.
      members: (orgId, me) => [
        orgMember({ orgId, address: me, role: 'OWNER', displayName: 'You Tester' }),
        orgMember({ orgId, address: BOB, role: 'PUBLISHER', displayName: 'Bob Builder' }),
        orgMember({ orgId, address: CAROL, role: 'MEMBER', displayName: 'Carol Member' }),
      ],
      answers: { OrgProposals: (v) => ({ orgProposals: proposals(String(v.orgId)) }) },
    })
    for (const name of [
      'ProposeOrgChange',
      'ApproveOrgProposal',
      'ExecuteOrgProposal',
      'CancelOrgProposal',
    ])
      await answer(setup.orgId, name, { id: 'p' })
    await expect(page.getByRole('note')).toContainText('Only one owner')
    await expect(page.getByRole('note')).toContainText('Propose a second owner below.')
    await expect(page.getByRole('list', { name: 'Owners' }).getByRole('listitem')).toHaveCount(1)

    await page.getByLabel('New owner').selectOption(BOB)
    await page.getByRole('button', { name: 'Propose a new owner' }).click()
    expect(await signedWrite(setup.wallet, 'proposeOrgChange', setup.orgId)).toEqual({
      orgId: setup.orgId,
      kind: 'ADD_OWNER',
      payload: { address: BOB },
    })

    const list = page.getByRole('list', { name: 'Proposals' })
    const approve = list.getByRole('listitem').filter({ hasText: 'Make 0x0c00…00c3 an owner' })
    await expect(approve).toContainText('Needs 1 more owner approval')
    await expect(approve).toContainText('0 of 1 owner approvals')
    await approve.getByRole('button', { name: /^Approve/ }).click()
    expect(await signedWrite(setup.wallet, 'approveOrgProposal', setup.orgId)).toEqual({
      orgId: setup.orgId,
      proposalId: 'p-approve',
    })

    const waiting = list.getByRole('listitem').filter({ hasText: 'Change the handle to @acme-two' })
    await expect(waiting).toContainText('Can run in 1 day 4 hours')
    await expect(waiting.getByRole('button', { name: /^Run now/ })).toHaveCount(0)

    const ready = list.getByRole('listitem').filter({ hasText: 'Freeze' })
    await expect(ready).toContainText('Ready to run')
    await expect(ready).toContainText('Renown runs it shortly if no owner does')
    await ready.getByRole('button', { name: /^Run now/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(`Freeze ${shortDid(APP_DID_A)} now?`)
    await dialog.getByRole('button', { name: /^Yes, freeze/ }).click()
    await expect(dialog).toBeHidden()
    expect(await signedWrite(setup.wallet, 'executeOrgProposal', setup.orgId)).toEqual({
      orgId: setup.orgId,
      proposalId: 'p-ready',
    })

    await waiting.getByRole('button', { name: /^Cancel/ }).click()
    await page.getByRole('button', { name: /^Yes, cancel/ }).click()
    expect(await signedWrite(setup.wallet, 'cancelOrgProposal', setup.orgId)).toEqual({
      orgId: setup.orgId,
      proposalId: 'p-wait',
    })
    await expect(
      list.getByRole('listitem').filter({ hasText: 'Delete the organisation' }),
    ).toContainText('Cancelled')
  })

  test('an admin suspends delegations and disables a service account, but cannot approve', async ({
    page,
  }) => {
    const credential = orgCredential({
      credentialId: 'urn:uuid:00000000-0000-4000-8000-0000000000d1',
      issuer: BOB,
    })
    const setup = await openManagePage(page, {
      role: 'ADMIN',
      section: 'security',
      org: { securityWarnings: ['SINGLE_OWNER'], ownerCount: 1 },
      answers: {
        OrgProposals: (v) => ({ orgProposals: proposals(String(v.orgId)) }),
        OrgCredentials: () => ({
          orgCredentials: [
            credential,
            orgCredential({
              credentialId: 'urn:uuid:00000000-0000-4000-8000-0000000000d2',
              status: {
                credentialId: 'x',
                appDid: APP_DID_A,
                orgId: 'o',
                counts: false,
                reason: 'SUSPENDED',
              },
            }),
          ],
        }),
        OrgWorkloads: () => ({ orgWorkloads: [orgWorkload({ repository: 'acme/ledger' })] }),
      },
    })
    await answer(setup.orgId, 'SuspendOrgCredentials', [credential.credentialId])
    await answer(setup.orgId, 'UnsuspendOrgCredential', true)
    await answer(setup.orgId, 'SetOrgWorkloadDisabled', orgWorkload({ disabled: true }))
    await expect(page.getByRole('button', { name: /^Approve/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Propose a new owner' })).toHaveCount(0)
    // Admins have no propose control: the note asks them to turn to the owner.
    await expect(page.getByRole('note')).toContainText('Ask the owner to propose a second owner.')
    await expect(page.getByRole('note')).not.toContainText('below')

    const delegations = page.getByRole('list', { name: 'Delegations' })
    await expect(delegations).toContainText('Suspended by the organisation')
    await delegations
      .getByRole('button', { name: 'Suspend the delegation from 0x0b00…00b2' })
      .click()
    expect(
      await signedWrite(setup.wallet, 'suspendOrgCredentials', setup.orgId, (v) =>
        Array.isArray(v.credentialIds),
      ),
    ).toEqual({
      orgId: setup.orgId,
      credentialIds: [credential.credentialId],
    })
    await delegations.getByRole('button', { name: /^Lift the suspension/ }).click()
    expect(await signedWrite(setup.wallet, 'unsuspendOrgCredential', setup.orgId)).toEqual({
      orgId: setup.orgId,
      credentialId: 'urn:uuid:00000000-0000-4000-8000-0000000000d2',
    })
    // P4: the per-issuer buttons render below the list, not inside it.
    const suspendAll = page.getByRole('button', {
      name: 'Suspend every delegation from 0x0b00…00b2',
    })
    // Cancelling the confirmation sends nothing.
    await suspendAll.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Suspend every delegation from 0x0b00…00b2?')
    await expect(dialog).toContainText('Acme Manage')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
    const sent = await stubRequests('mutation SuspendOrgCredentials(')
    expect(
      sent.filter((r) => r.variables.orgId === setup.orgId && r.variables.memberAddress),
    ).toEqual([])
    await suspendAll.click()
    await page
      .getByRole('button', { name: 'Yes, suspend every delegation from 0x0b00…00b2' })
      .click()
    expect(
      await signedWrite(
        setup.wallet,
        'suspendOrgCredentials',
        setup.orgId,
        (v) => typeof v.memberAddress === 'string',
      ),
    ).toEqual({
      orgId: setup.orgId,
      memberAddress: BOB,
    })

    await page
      .getByRole('list', { name: 'Service accounts' })
      .getByRole('button', { name: 'Disable acme/ledger' })
      .click()
    expect(await signedWrite(setup.wallet, 'setOrgWorkloadDisabled', setup.orgId)).toMatchObject({
      orgId: setup.orgId,
      disabled: true,
    })
  })

  test('only current owners’ approvals count; a recovery waits, cannot be approved and owners can cancel it', async ({
    page,
  }) => {
    const DEPARTED = '0x0e000000000000000000000000000000000000e5'
    const setup = await openManagePage(page, {
      role: 'OWNER',
      section: 'security',
      answers: {
        OrgProposals: (v) => ({
          orgProposals: [
            // A departed owner's approval no longer counts: 1 of max(1, min(2, 2 owners)) = 2.
            orgProposal({
              orgId: String(v.orgId),
              id: 'p-departed',
              kind: 'ADD_OWNER',
              payload: { ...blank, address: CAROL },
              proposer: DEPARTED,
              approvals: [DEPARTED, OWNER],
              threshold: 1,
              createdAt: iso(-DAY),
              expiresAt: iso(13 * DAY),
            }),
            orgProposal({
              orgId: String(v.orgId),
              id: 'p-recover',
              kind: 'RECOVER',
              payload: { ...blank, address: BOB, domain: 'acme.example' },
              proposer: BOB,
              approvals: [],
              threshold: 0,
              executableAt: iso(3 * DAY + 60_000),
              expiresAt: iso(13 * DAY),
            }),
          ],
        }),
      },
    })
    await answer(setup.orgId, 'CancelOrgProposal', { id: 'p-recover' })
    await expect(page.getByRole('note')).toHaveCount(0)
    const list = page.getByRole('list', { name: 'Proposals' })
    const departed = list.getByRole('listitem').filter({ hasText: 'Make 0x0c00…00c3 an owner' })
    await expect(departed).toContainText('1 of 2 owner approvals')
    await expect(departed).toContainText('Needs 1 more owner approval')
    await expect(departed).toHaveAttribute('id', 'proposal-p-departed')
    // The owners panel links the pending proposal instead of offering a duplicate.
    await page.getByLabel('New owner').selectOption(CAROL)
    await expect(page.getByRole('button', { name: 'Propose a new owner' })).toBeDisabled()

    const recovery = list
      .getByRole('listitem')
      .filter({ hasText: 'Recover the organisation for 0x0b00…00b2 through acme.example' })
    await expect(recovery).toContainText('Can run in 3 days')
    await expect(recovery).toContainText('any of them can cancel it')
    await expect(recovery.getByRole('button', { name: /^Approve/ })).toHaveCount(0)
    await expect(recovery.getByRole('button', { name: /^Run now/ })).toHaveCount(0)
    await recovery.getByRole('button', { name: /^Cancel/ }).click()
    await page.getByRole('button', { name: /^Yes, cancel/ }).click()
    expect(await signedWrite(setup.wallet, 'cancelOrgProposal', setup.orgId)).toEqual({
      orgId: setup.orgId,
      proposalId: 'p-recover',
    })
  })

  test('high-impact approvals, runs and owner removals ask first, naming what they act on; cancel sends nothing', async ({
    page,
  }) => {
    let viewer = ''
    const setup = await openManagePage(page, {
      role: 'OWNER',
      section: 'security',
      members: (orgId, me) => {
        viewer = me
        return defaultMembers(orgId, me, 'OWNER')
      },
      answers: {
        OrgProposals: (v) => {
          const orgId = String(v.orgId)
          const waiting = {
            approvals: [OWNER],
            threshold: 2,
            createdAt: iso(-DAY),
            expiresAt: iso(13 * DAY),
          }
          const ready = { ...waiting, threshold: 1, executableAt: iso(-60_000) }
          return {
            orgProposals: [
              orgProposal({ orgId, id: 'p-delete', kind: 'DELETE_ORG', ...waiting }),
              orgProposal({
                orgId,
                id: 'p-transfer',
                kind: 'TRANSFER_APP_OUT',
                payload: { ...blank, appDid: APP_DID_A, toKind: 'PERSON', toId: CAROL },
                ...waiting,
              }),
              orgProposal({
                orgId,
                id: 'p-handle',
                kind: 'CHANGE_HANDLE',
                payload: { ...blank, handle: 'acme-two' },
                ...waiting,
              }),
              orgProposal({
                orgId,
                id: 'p-freeze',
                kind: 'FREEZE_APP',
                payload: { ...blank, appDid: APP_DID_A },
                ...ready,
              }),
              orgProposal({
                orgId,
                id: 'p-remove-me',
                kind: 'REMOVE_OWNER',
                payload: { ...blank, address: viewer, demoteToAdmin: false },
                ...ready,
              }),
              orgProposal({
                orgId,
                id: 'p-recover',
                kind: 'RECOVER',
                payload: { ...blank, address: DAVE, domain: 'acme.example' },
                proposer: DAVE,
                approvals: [],
                threshold: 0,
                createdAt: iso(-8 * DAY),
                executableAt: iso(-60_000),
                expiresAt: iso(13 * DAY),
              }),
            ],
          }
        },
      },
    })
    const app = shortDid(APP_DID_A)
    const cases: { item: string; button: RegExp; texts: string[] }[] = [
      {
        item: '#proposal-p-delete',
        button: /^Approve/,
        texts: ['Approve: delete Acme Manage?', 'cannot be undone'],
      },
      {
        item: '#proposal-p-transfer',
        button: /^Approve/,
        texts: [`transfer ${app} out of Acme Manage`, 'Carol Member'],
      },
      { item: '#proposal-p-handle', button: /^Approve/, texts: ['Acme Manage moves to @acme-two'] },
      {
        item: '#proposal-p-freeze',
        button: /^Run now/,
        texts: [`Freeze ${app} now?`, 'no tokens'],
      },
      {
        item: '#proposal-p-remove-me',
        button: /^Run now/,
        texts: ['Remove You Tester', 'This ends your own ownership of Acme Manage.'],
      },
      {
        item: '#proposal-p-recover',
        button: /^Run now/,
        texts: [
          'Recover Acme Manage for 0x0d00…00d4 now?',
          'acme.example',
          'hands it to someone else',
        ],
      },
    ]
    const dialog = page.getByRole('dialog')
    for (const c of cases) {
      await page.locator(c.item).getByRole('button', { name: c.button }).click()
      await expect(dialog).toBeVisible()
      for (const text of c.texts) await expect(dialog).toContainText(text)
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(dialog).toBeHidden()
    }
    await page.getByRole('button', { name: 'Propose removing Olga Owner' }).click()
    await expect(dialog).toContainText('Propose removing Olga Owner?')
    await expect(dialog).toContainText(
      'Olga Owner stops being an owner of Acme Manage and becomes an admin',
    )
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()

    for (const name of ['ApproveOrgProposal', 'ExecuteOrgProposal', 'ProposeOrgChange']) {
      const sent = await stubRequests(`mutation ${name}(`)
      expect(sent.filter((r) => r.variables.orgId === setup.orgId)).toEqual([])
    }
  })

  test('a countdown turns into Ready to run, with Run now, without a reload', async ({ page }) => {
    await page.clock.install({ time: new Date() })
    await openManagePage(page, {
      role: 'OWNER',
      section: 'security',
      answers: {
        OrgProposals: (v) => ({
          orgProposals: [
            orgProposal({
              orgId: String(v.orgId),
              id: 'p-soon',
              kind: 'UNFREEZE_APP',
              payload: { ...blank, appDid: APP_DID_A },
              proposer: OWNER,
              approvals: [OWNER],
              threshold: 1,
              executableAt: iso(90_000),
              expiresAt: iso(13 * DAY),
            }),
          ],
        }),
      },
    })
    const item = page.locator('#proposal-p-soon')
    await expect(item).toContainText(/Can run in (1 minute|less than a minute)/)
    await expect(item.getByRole('button', { name: /^Run now/ })).toHaveCount(0)
    await page.clock.fastForward('02:30')
    await expect(item).toContainText('Ready to run')
    await expect(item.getByRole('button', { name: /^Run now/ })).toBeVisible()
  })
})
