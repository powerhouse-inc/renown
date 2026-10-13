import { test, expect } from '@playwright/test'
import { auditActionText, auditDetailsText, auditFileName } from '../lib/orgs/audit'
import { parseRedirectUris } from '../lib/orgs/oidc'
import { auditEntry, orgOidcClient } from './support/org-fixtures'
import { openManagePage, signedWrite } from './support/org-manage'
import { fixtureStub } from './support/stub-switchboard-client'

async function answer(orgId: string, name: string, value: unknown) {
  await fixtureStub({ match: `mutation ${name}`, variables: orgId, response: { data: { [name.charAt(0).toLowerCase() + name.slice(1)]: value } } })
}

test.describe('oidc and audit rules', () => {
  test('redirect URIs and audit wording', () => {
    expect(parseRedirectUris(' https://a.example/cb \n\nhttps://a.example/cb\nhttp://localhost:3000/cb ')).toEqual({ uris: ['https://a.example/cb', 'http://localhost:3000/cb'] })
    expect(parseRedirectUris('')).toEqual({ problem: 'Add at least one redirect URI.' })
    expect(parseRedirectUris('http://a.example/cb')).toEqual({ problem: 'http://a.example/cb: use https:// (http:// only for localhost).' })
    expect(auditActionText('inviteOrgMember')).toBe('Invited a member')
    expect(auditActionText('system.executeOrgProposal')).toBe('Ran a proposal (automatically)')
    expect(auditActionText('somethingNew')).toBe('somethingNew')
    expect(auditDetailsText('{"address":"0x0b000000000000000000000000000000000000b2","role":"MEMBER"}')).toBe('address 0x0b00…00b2, role MEMBER')
    expect(auditFileName('acme', new Date('2026-10-12T12:00:00.000Z'))).toBe('renown-acme-audit-2026-10-12.json')
  })
})

test.describe('manage: sign-in clients', () => {
  test('registers a client, shows the secret once, rotates it and edits redirect URIs', async ({ page }) => {
    const setup = await openManagePage(page, {
      role: 'ADMIN',
      section: 'oidc',
      answers: {
        OrgOidcClients: (v) => ({
          orgOidcClients: [orgOidcClient({ orgId: String(v.orgId), redirectUris: ['https://intranet.acme.example/callback', 'https://intranet.acme.example/alt'] })],
        }),
      },
    })
    await answer(setup.orgId, 'RegisterOrgOidcClient', { clientId: 'client-new', clientSecret: 'secret-shown-once-AAAAAAAA' })
    await answer(setup.orgId, 'RotateOrgOidcClientSecret', { clientId: 'client-1', clientSecret: 'secret-rotated-BBBBBBBB' })
    await answer(setup.orgId, 'UpdateOrgOidcClient', orgOidcClient({ orgId: setup.orgId }))

    await page.getByLabel('Client name').fill('Acme wiki')
    await page.getByLabel('Redirect URIs').fill('https://wiki.acme.example/callback')
    await page.getByRole('button', { name: 'Register client' }).click()
    expect(await signedWrite(setup.wallet, 'registerOrgOidcClient', setup.orgId)).toEqual({
      orgId: setup.orgId,
      name: 'Acme wiki',
      redirectUris: ['https://wiki.acme.example/callback'],
    })
    await expect(page.getByRole('region', { name: 'Client secret' })).toContainText('secret-shown-once-AAAAAAAA')
    await expect(page.getByRole('region', { name: 'Client secret' })).toContainText('client-new')

    const client = page.getByRole('list', { name: 'Sign-in clients' }).getByRole('listitem').first()
    await client.getByRole('button', { name: 'Rotate the secret of Acme intranet' }).click()
    await page.getByRole('button', { name: 'Yes, rotate it' }).click()
    expect(await signedWrite(setup.wallet, 'rotateOrgOidcClientSecret', setup.orgId)).toEqual({ orgId: setup.orgId, clientId: 'client-1' })
    await expect(page.getByRole('region', { name: 'Client secret' })).toContainText('secret-rotated-BBBBBBBB')

    await client.getByLabel('Add a redirect URI').fill('https://intranet.acme.example/other')
    await client.getByRole('button', { name: 'Add URI' }).click()
    expect(await signedWrite(setup.wallet, 'updateOrgOidcClient', setup.orgId, (v) => Array.isArray(v.addRedirectUris))).toEqual({
      orgId: setup.orgId,
      clientId: 'client-1',
      addRedirectUris: ['https://intranet.acme.example/other'],
    })
    await client.getByRole('button', { name: 'Remove https://intranet.acme.example/callback' }).click()
    expect(await signedWrite(setup.wallet, 'updateOrgOidcClient', setup.orgId, (v) => Array.isArray(v.removeRedirectUris))).toEqual({
      orgId: setup.orgId,
      clientId: 'client-1',
      removeRedirectUris: ['https://intranet.acme.example/callback'],
    })
  })
})

test.describe('manage: audit log', () => {
  test('lists entries, pages and exports JSON', async ({ page }) => {
    await openManagePage(page, {
      role: 'ADMIN',
      section: 'audit',
      answers: {
        OrgAuditLog: (v) =>
          v.after
            ? { orgAuditLog: { items: [auditEntry({ id: 'a2', action: 'system.executeOrgProposal', actor: 'system', details: '{}' })], next: null } }
            : { orgAuditLog: { items: [auditEntry({ id: 'a1' })], next: 'cursor-2' } },
        OrgAuditExport: () => ({ orgAuditExport: JSON.stringify([{ id: 'a1' }, { id: 'a2' }]) }),
      },
    })
    const table = page.getByRole('table', { name: 'Audit log' })
    await expect(table).toContainText('Invited a member')
    await expect(table).toContainText('role MEMBER')
    await page.getByRole('button', { name: 'Load more' }).click()
    await expect(table).toContainText('Ran a proposal (automatically)')
    await expect(table).toContainText('Renown')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export JSON' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^renown-acme-manage-audit-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
