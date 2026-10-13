import { test, expect } from '@playwright/test'
import { domainProblem, normalizeDomain } from '../lib/orgs/domains'
import { ORG_WEBHOOK_EVENTS, webhookUrlProblem } from '../lib/orgs/webhooks'
import { orgDelivery, orgDomain, orgWebhook } from './support/org-fixtures'
import { openManagePage, signedWrite } from './support/org-manage'
import { fixtureStub } from './support/stub-switchboard-client'

async function answer(orgId: string, name: string, value: unknown) {
  await fixtureStub({ match: `mutation ${name}`, variables: orgId, response: { data: { [name.charAt(0).toLowerCase() + name.slice(1)]: value } } })
}

test.describe('domain and webhook rules', () => {
  test('domains are normalised and checked, webhooks are https', () => {
    expect(normalizeDomain(' https://WWW.Acme.Example/about ')).toBe('www.acme.example')
    expect(normalizeDomain('acme.example.')).toBe('acme.example')
    expect(domainProblem('acme')).toBe('Enter a domain such as acme.com.')
    expect(domainProblem('10.0.0.1')).toBe('Enter a domain such as acme.com.')
    expect(domainProblem('acme.example')).toBeNull()
    expect(ORG_WEBHOOK_EVENTS).toHaveLength(19)
    expect(webhookUrlProblem('http://hooks.example')).toBe('Use an https:// address.')
    expect(webhookUrlProblem('https://user:pw@hooks.example')).toBe('Leave user names and passwords out of the address.')
    expect(webhookUrlProblem('https://hooks.example:8080/x')).toBe('Use port 443 or 8443.')
    expect(webhookUrlProblem('https://hooks.example:8443/x')).toBeNull()
    expect(webhookUrlProblem('https://hooks.example:443/x')).toBeNull()
    expect(webhookUrlProblem('https://hooks.example/renown')).toBeNull()
  })
})

test.describe('manage: domains', () => {
  test('adds a domain, shows both proofs, checks and removes it', async ({ page }) => {
    const setup = await openManagePage(page, {
      role: 'ADMIN',
      section: 'domains',
      answers: {
        OrgDomains: (v) => ({
          orgDomains: [
            orgDomain({ orgId: String(v.orgId), id: 'd-pending', domain: 'acme.example' }),
            orgDomain({ orgId: String(v.orgId), id: 'd-ok', domain: 'verified.example', status: 'VERIFIED', verifiedAt: '2026-10-01T10:00:00.000Z' }),
          ],
        }),
      },
    })
    await answer(setup.orgId, 'AddOrgDomain', orgDomain({ orgId: setup.orgId, domain: 'new.example' }))
    await fixtureStub({ match: 'mutation CheckOrgDomain', variables: 'd-pending', response: { data: null, errors: [{ message: 'Proof missing', extensions: { code: 'DOMAIN_PROOF_MISSING' } }] } })
    await answer(setup.orgId, 'RemoveOrgDomain', true)

    await page.getByRole('textbox', { name: 'Domain' }).fill('https://New.Example/')
    await page.getByRole('button', { name: 'Add domain' }).click()
    expect(await signedWrite(setup.wallet, 'addOrgDomain', setup.orgId)).toEqual({ orgId: setup.orgId, domain: 'new.example' })

    const pending = page.getByRole('list', { name: 'Domains' }).getByRole('listitem').filter({ hasText: 'acme.example' })
    await expect(pending).toContainText('_renown.acme.example')
    await expect(pending).toContainText(`renown-org=${setup.orgId};token=tok123`)
    await expect(pending).toContainText('https://acme.example/.well-known/renown.json')
    // Admins cannot remove a verified domain.
    const verified = page.getByRole('list', { name: 'Domains' }).getByRole('listitem').filter({ hasText: 'verified.example' })
    await expect(verified).toContainText('Only owners can remove a verified domain.')
    await expect(verified.getByRole('button', { name: 'Remove verified.example' })).toHaveCount(0)
    await pending.getByRole('button', { name: 'Check acme.example now' }).click()
    await expect(page.getByText('Renown could not find the proof yet.')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Domains' })).toContainText('Verified since 1 October 2026')
    await pending.getByRole('button', { name: 'Remove acme.example' }).click()
    await page.getByRole('button', { name: 'Yes, remove acme.example' }).click()
    expect(await signedWrite(setup.wallet, 'removeOrgDomain', setup.orgId)).toEqual({ orgId: setup.orgId, domainId: 'd-pending' })
  })
})

test.describe('manage: webhooks', () => {
  test('shows the webhook secret once, tests, disables and lists deliveries', async ({ page }) => {
    const setup = await openManagePage(page, {
      role: 'ADMIN',
      section: 'webhooks',
      answers: {
        OrgWebhooks: (v) => ({ orgWebhooks: [orgWebhook({ orgId: String(v.orgId), id: 'hook-1' })] }),
        OrgWebhookDeliveries: () => ({ orgWebhookDeliveries: [orgDelivery({ status: 'FAILED', responseStatus: 500, lastError: 'Server error' }), orgDelivery({ id: 'delivery-2', status: 'PAUSED', responseStatus: null })] }),
      },
    })
    const secret = 'whsec_E2eShownOnceAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    await answer(setup.orgId, 'CreateOrgWebhook', { webhook: orgWebhook({ orgId: setup.orgId, id: 'hook-2' }), secret })
    await answer(setup.orgId, 'TestOrgWebhook', orgDelivery({ eventType: 'ping', status: 'DELIVERED', responseStatus: 204 }))
    await answer(setup.orgId, 'UpdateOrgWebhook', orgWebhook({ orgId: setup.orgId, enabled: false }))

    await page.getByLabel('Endpoint URL').fill('https://hooks.acme.example/new')
    await page.getByLabel('member.joined').check()
    await page.getByLabel('proposal.created').check()
    await page.getByRole('button', { name: 'Add webhook' }).click()
    expect(await signedWrite(setup.wallet, 'createOrgWebhook', setup.orgId)).toEqual({
      orgId: setup.orgId,
      url: 'https://hooks.acme.example/new',
      events: ['member.joined', 'proposal.created'],
    })
    const shown = page.getByRole('region', { name: 'Webhook signing secret' })
    await expect(shown).toContainText(secret)
    expect(page.url()).not.toContain(secret)

    const hook = page.getByRole('list', { name: 'Webhooks' }).getByRole('listitem').first()
    await hook.getByRole('button', { name: 'Send a test event' }).click()
    await expect(page.getByText('Test event delivered (HTTP 204).')).toBeVisible()
    await hook.getByRole('button', { name: 'Show deliveries' }).click()
    await expect(hook.getByRole('list', { name: 'Deliveries' })).toContainText('Failed, HTTP 500')
    await expect(hook.getByRole('list', { name: 'Deliveries' })).toContainText('Paused while the organisation is taken down')
    await hook.getByRole('button', { name: 'Disable' }).click()
    expect(await signedWrite(setup.wallet, 'updateOrgWebhook', setup.orgId)).toEqual({ orgId: setup.orgId, webhookId: 'hook-1', enabled: false })

    await page.getByRole('navigation', { name: 'Organisation settings' }).getByRole('link', { name: 'Members' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Webhooks' })).toHaveCount(0)
    await page.getByRole('navigation', { name: 'Organisation settings' }).getByRole('link', { name: 'Webhooks' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Webhooks' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Webhook signing secret' })).toHaveCount(0)
  })
})
