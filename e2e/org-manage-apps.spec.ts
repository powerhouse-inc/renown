import { test, expect } from '@playwright/test'
import { APP_DID_A, APP_DID_B, appProfile, appTransfer, orgSummary, serveOrgReads, serveStatsReads } from './support/org-fixtures'
import { DAVE, openManagePage, signedWrite } from './support/org-manage'
import { fixtureStub } from './support/stub-switchboard-client'
import { signInTestWallet } from './support/test-session'

const APP_DID_C = 'did:key:z6MkAcmeFixtureAppCxxxxxxxxxxxxxxxxxxxxxxxxxxx3'
const APPS = [
  { appDid: APP_DID_A, addedAt: '2026-10-02T10:00:00.000Z', frozen: false },
  { appDid: APP_DID_B, addedAt: '2026-10-03T10:00:00.000Z', frozen: true },
]

async function answer(name: string, variables: string, value: unknown) {
  await fixtureStub({ match: `mutation ${name}`, variables, response: { data: { [name.charAt(0).toLowerCase() + name.slice(1)]: value } } })
}

async function serveApps(page: import('@playwright/test').Page, transfers: (orgId: string) => unknown[]) {
  await serveStatsReads(page, {
    AppProfilesByOrg: () => ({ appProfiles: { items: [appProfile({ appDid: APP_DID_A, name: 'Acme Ledger' }), appProfile({ appDid: APP_DID_B, name: 'Acme Vault' })], next: null } }),
    // The wallet's own person-owned app (the query's publisherDid is the wallet address).
    AppProfilesByPublisher: (v) => ({ appProfilesByPublisher: [appProfile({ appDid: APP_DID_C, name: 'My Side Project', publisherDid: `did:pkh:eip155:1:${String(v.publisherDid)}` })] }),
  })
  await serveOrgReads(page, { AppTransfers: (v) => ({ appTransfers: transfers(String(v.orgId ?? '')) }) })
}

test.describe('manage: apps', () => {
  test('an owner proposes freezing, unfreezing and transferring an app out', async ({ page }) => {
    await serveApps(page, () => [])
    const setup = await openManagePage(page, { role: 'OWNER', section: 'apps', org: { apps: APPS } })
    await answer('ProposeOrgChange', setup.orgId, { id: 'p1' })
    const apps = page.getByRole('list', { name: 'Organisation apps' })
    await expect(apps.getByRole('listitem').filter({ hasText: 'Acme Vault' }).getByText('Frozen', { exact: true })).toBeVisible()

    await apps.getByRole('button', { name: 'Propose freezing Acme Ledger' }).click()
    expect(await signedWrite(setup.wallet, 'proposeOrgChange', setup.orgId, (v) => (v.kind as string) === 'FREEZE_APP')).toEqual({
      orgId: setup.orgId,
      kind: 'FREEZE_APP',
      payload: { appDid: APP_DID_A },
    })
    await expect(apps.getByRole('button', { name: 'Propose unfreezing Acme Vault' })).toBeVisible()

    await apps.getByRole('button', { name: 'Transfer Acme Ledger out' }).click()
    await page.getByLabel('A person (wallet address)').check()
    await page.getByLabel('Recipient').fill(DAVE.toUpperCase().replace('0X', '0x'))
    await page.getByRole('button', { name: 'Propose transfer' }).click()
    expect(await signedWrite(setup.wallet, 'proposeOrgChange', setup.orgId, (v) => (v.kind as string) === 'TRANSFER_APP_OUT')).toEqual({
      orgId: setup.orgId,
      kind: 'TRANSFER_APP_OUT',
      payload: { appDid: APP_DID_A, toKind: 'PERSON', toId: DAVE },
    })
  })

  test('an admin accepts an incoming transfer and cancels an outgoing one', async ({ page }) => {
    await serveApps(page, (orgId) => [
      appTransfer({ id: 'tr-in', appDid: APP_DID_C, fromKind: 'PERSON', fromId: DAVE, toKind: 'ORG', toId: orgId }),
      appTransfer({ id: 'tr-out', appDid: APP_DID_A, fromKind: 'ORG', fromId: orgId, toKind: 'PERSON', toId: DAVE }),
    ])
    const setup = await openManagePage(page, { role: 'ADMIN', section: 'apps', org: { apps: APPS } })
    await answer('AcceptAppTransfer', 'tr-in', appTransfer({ id: 'tr-in', status: 'ACCEPTED' }))
    await answer('DeclineAppTransfer', 'tr-out', appTransfer({ id: 'tr-out', status: 'CANCELLED' }))
    await expect(page.getByRole('button', { name: /Propose freezing/ })).toHaveCount(0)
    const incoming = page.getByRole('list', { name: 'Incoming transfers' })
    await expect(incoming).toContainText('from 0x0d00…00d4')
    await incoming.getByRole('button', { name: /^Accept/ }).click()
    expect(await signedWrite(setup.wallet, 'acceptAppTransfer', null, (v) => v.transferId === 'tr-in')).toEqual({ transferId: 'tr-in' })
    await page.getByRole('list', { name: 'Outgoing transfers' }).getByRole('button', { name: /^Cancel the transfer/ }).click()
    expect(await signedWrite(setup.wallet, 'declineAppTransfer', null, (v) => v.transferId === 'tr-out')).toEqual({ transferId: 'tr-out' })
  })

  test('a member brings an app they publish, preselected from the link', async ({ page }) => {
    const asked: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && (r.postData() ?? '').includes('query AppTransfers')) asked.push(r.url())
    })
    await serveApps(page, () => [])
    const setup = await openManagePage(page, { role: 'MEMBER', section: 'apps', org: { apps: APPS }, search: `bring=${encodeURIComponent(APP_DID_C)}` })
    await answer('ProposeAppTransfer', APP_DID_C, appTransfer({ id: 'tr-new', appDid: APP_DID_C }))
    await expect(page.getByLabel('App to bring')).toHaveValue(APP_DID_C)
    await page.getByRole('button', { name: 'Request transfer to Acme Manage' }).click()
    expect(await signedWrite(setup.wallet, 'proposeAppTransfer', null, (v) => v.appDid === APP_DID_C)).toEqual({ appDid: APP_DID_C, toOrgId: setup.orgId })
    // appTransfers(orgId) is admin-only: a member neither loads nor sees the panel.
    await expect(page.getByRole('heading', { name: 'Transfers' })).toHaveCount(0)
    expect(asked).toEqual([])
  })
})

test.describe('/me app transfers', () => {
  test('a person accepts an app an organisation transfers to them', async ({ page }) => {
    const wallet = await signInTestWallet(page, { bearer: 'e2e-me-transfers' })
    const from = orgSummary({ id: crypto.randomUUID(), handle: 'acme-giver', name: 'Acme Giver' })
    const transferId = `tr-${crypto.randomUUID()}`
    await serveOrgReads(page, {
      AppTransfers: () => ({ appTransfers: [appTransfer({ id: transferId, fromKind: 'ORG', fromId: from.id, toKind: 'PERSON', toId: wallet.address.toLowerCase() })] }),
    })
    await answer('AcceptAppTransfer', transferId, appTransfer({ id: transferId, status: 'ACCEPTED' }))
    await page.goto('/me')
    const section = page.getByRole('region', { name: 'App transfers' })
    await expect(section).toContainText('offered to you by an organisation', { timeout: 30_000 })
    await section.getByRole('button', { name: /^Accept/ }).click()
    expect(await signedWrite(wallet, 'acceptAppTransfer', null, (v) => v.transferId === transferId)).toEqual({ transferId })
  })
})
