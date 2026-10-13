import { test, expect, type Route } from '@playwright/test'
import { organization, orgReport, orgSummary, serveOrgReads } from './support/org-fixtures'
import { signedWrite } from './support/org-manage'
import { fixtureStub, graphqlError, STUB_SWITCHBOARD_URL } from './support/stub-switchboard-client'
import { signInTestWallet } from './support/test-session'

const ORG_ID = 'a0c0ffee-0000-4000-8000-00000000f001'
const RATE_ORG_ID = 'a0c0ffee-0000-4000-8000-00000000f002'
const ARCHIVED_ORG_ID = 'a0c0ffee-0000-4000-8000-00000000f003'

test.beforeAll(async () => {
  await fixtureStub({ match: 'query OrgByRef', variables: '"acme-report"', response: { data: { organization: organization({ id: ORG_ID, handle: 'acme-report', name: 'Acme Report Works' }) } } })
  await fixtureStub({ match: 'mutation ReportOrganization', variables: ORG_ID, response: { data: { reportOrganization: true } } })
  await fixtureStub({ match: 'query OrgByRef', variables: '"acme-rate"', response: { data: { organization: organization({ id: RATE_ORG_ID, handle: 'acme-rate', name: 'Acme Rate Works' }) } } })
  await fixtureStub({ match: 'mutation ReportOrganization', variables: RATE_ORG_ID, response: graphqlError('Too many reports', 'RATE_LIMITED') })
  await fixtureStub({
    match: 'query OrgByRef',
    variables: '"acme-archived-report"',
    response: { data: { organization: organization({ id: ARCHIVED_ORG_ID, handle: 'acme-archived-report', name: 'Acme Archived Report', archived: true }) } },
  })
})

test.describe('report an organisation', () => {
  test('signs a report from the organisation page', async ({ page }) => {
    const wallet = await signInTestWallet(page, { bearer: 'e2e-report' })
    await page.goto('/@acme-report')
    await page.getByRole('button', { name: 'Report', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Report Acme Report Works' })
    await dialog.getByLabel('Spam').check({ timeout: 30_000 })
    await dialog.getByLabel('Details (optional)').fill('Sells fake tokens.')
    await dialog.getByRole('button', { name: 'Send report' }).click()
    await expect(dialog).toContainText('Thank you.')
    expect(await signedWrite(wallet, 'reportOrganization', ORG_ID)).toEqual({ orgId: ORG_ID, reason: 'SPAM', details: 'Sells fake tokens.' })
  })

  test('says how many reports fit in a day when rate limited', async ({ page }) => {
    await signInTestWallet(page, { bearer: 'e2e-report-rate' })
    await page.goto('/@acme-rate')
    await page.getByRole('button', { name: 'Report', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Report Acme Rate Works' })
    await dialog.getByRole('button', { name: 'Send report' }).click({ timeout: 30_000 })
    await expect(dialog.getByRole('alert')).toHaveText('You can send 5 reports a day.')
  })

  test('a lost answer says the report may have been sent and offers no immediate resend', async ({ page }) => {
    await signInTestWallet(page, { bearer: 'e2e-report-lost' })
    await page.goto('/@acme-report')
    await page.getByRole('button', { name: 'Report', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Report Acme Report Works' })
    await page.route('**/api/org/reportOrganization', (route) => route.abort())
    await dialog.getByRole('button', { name: 'Send report' }).click({ timeout: 30_000 })
    await expect(dialog.getByRole('status')).toContainText("We couldn't confirm whether your report was sent.")
    await expect(dialog).not.toContainText('Nothing was changed')
    await expect(dialog.getByRole('button', { name: 'Send report' })).toHaveCount(0)
  })

  test('the dialog is modal: focus starts inside, stays inside, and returns to Report on Esc', async ({ page }) => {
    await signInTestWallet(page, { bearer: 'e2e-report-focus' })
    await page.goto('/@acme-report')
    const report = page.getByRole('button', { name: 'Report', exact: true })
    await report.click()
    const dialog = page.getByRole('dialog', { name: 'Report Acme Report Works' })
    await expect(dialog.getByLabel('Spam')).toBeVisible({ timeout: 30_000 })
    const inside = () => page.evaluate(() => !!document.activeElement?.closest('dialog[open]'))
    await expect.poll(inside).toBe(true)
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab')
      // Tab may leave for the browser chrome (body), never for the page behind.
      expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest('dialog[open]'))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(report).toBeFocused()
  })

  test('an archived organisation offers no Report button', async ({ page }) => {
    await page.goto('/@acme-archived-report')
    await expect(page.getByRole('heading', { level: 1, name: 'Acme Archived Report' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Report', exact: true })).toHaveCount(0)
  })

  test('asks signed-out visitors to sign in', async ({ page }) => {
    await page.goto('/@acme-report')
    await page.getByRole('button', { name: 'Report', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Report Acme Report Works' }).getByRole('button', { name: 'Sign in to report' })).toBeVisible({ timeout: 30_000 })
  })
})

test.describe('/admin/reports', () => {
  test('shows the 404 content to everyone but platform admins', async ({ page }) => {
    await page.goto('/admin/reports')
    await expect(page.getByRole('heading', { level: 1, name: 'This page is not on the network' })).toBeVisible({ timeout: 30_000 })
    await signInTestWallet(page, { bearer: 'e2e-not-admin' })
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, (route: Route) =>
      (route.request().postDataJSON() as { query: string }).query.includes('query OrgReports') ? route.fulfill({ json: graphqlError('Platform admins only', 'FORBIDDEN') }) : route.continue(),
    )
    await page.goto('/admin/reports')
    await expect(page.getByRole('heading', { level: 1, name: 'This page is not on the network' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('list', { name: 'Reports' })).toHaveCount(0)
  })

  test('an expired bearer is refreshed once instead of showing the 404 content', async ({ page }) => {
    await signInTestWallet(page, { bearer: 'e2e-admin-expired' })
    let calls = 0
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
      const { query } = route.request().postDataJSON() as { query: string }
      if (!query.includes('query OrgReports')) return route.fallback()
      calls += 1
      if (calls === 1) return route.fulfill({ status: 401, json: { error: 'Verification failed' } })
      return route.fulfill({ json: { data: { orgReports: [orgReport({ id: 'r-expired', org: orgSummary({ id: 'org-exp', handle: 'exp-acme', name: 'Expired Acme' }) })] } } })
    })
    await page.goto('/admin/reports')
    await expect(page.getByRole('list', { name: 'Reports' })).toContainText('Expired Acme', { timeout: 30_000 })
    expect(calls).toBeGreaterThanOrEqual(2)
  })

  test('a platform admin takes an organisation down with a note, after confirming', async ({ page }) => {
    const wallet = await signInTestWallet(page, { bearer: 'e2e-admin' })
    const reportId = `r-${crypto.randomUUID()}`
    await serveOrgReads(page, { OrgReports: () => ({ orgReports: [orgReport({ id: reportId, org: orgSummary({ id: 'org-bad', handle: 'fake-acme', name: 'Fake Acme' }) })] }) })
    await fixtureStub({ match: 'mutation ResolveOrgReport', variables: reportId, response: { data: { resolveOrgReport: orgReport({ id: reportId, status: 'RESOLVED', resolution: 'TAKE_DOWN' }) } } })
    await page.goto('/admin/reports')
    const report = page.getByRole('list', { name: 'Reports' }).getByRole('listitem').filter({ hasText: 'Fake Acme' })
    await expect(report).toContainText('Pretends to be the real Acme.', { timeout: 30_000 })
    await expect(report.getByRole('button', { name: 'Restore' })).toHaveCount(0)
    await report.getByLabel('Note').fill('Confirmed impersonation.')
    await report.getByRole('button', { name: 'Take down' }).click()
    const confirm = page.getByRole('dialog', { name: 'Take down Fake Acme?' })
    await expect(confirm).toContainText('disappears everywhere')
    await confirm.getByRole('button', { name: 'Take down Fake Acme' }).click()
    expect(await signedWrite(wallet, 'resolveOrgReport', null, (v) => v.reportId === reportId)).toEqual({ reportId, resolution: 'TAKE_DOWN', note: 'Confirmed impersonation.' })
  })

  test('a lost answer to a resolution says it may have gone through and re-reads the reports', async ({ page }) => {
    await signInTestWallet(page, { bearer: 'e2e-admin-lost' })
    const reportId = `r-${crypto.randomUUID()}`
    let reads = 0
    await serveOrgReads(page, {
      OrgReports: () => {
        reads += 1
        return { orgReports: [orgReport({ id: reportId, org: orgSummary({ id: 'org-bad', handle: 'fake-acme', name: 'Fake Acme' }) })] }
      },
    })
    await page.route('**/api/org/resolveOrgReport', (route) => route.abort())
    await page.goto('/admin/reports')
    const report = page.getByRole('list', { name: 'Reports' }).getByRole('listitem').filter({ hasText: 'Fake Acme' })
    await expect(report.getByRole('button', { name: 'Dismiss' })).toBeVisible({ timeout: 30_000 })
    const before = reads
    await report.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByText("We couldn't confirm whether that went through — checking…")).toBeVisible()
    await expect(page.getByText('Nothing was changed', { exact: false })).toHaveCount(0)
    await expect.poll(() => reads).toBeGreaterThan(before)
  })

  test('a taken-down report offers Restore, and a deleted organisation only Dismiss', async ({ page }) => {
    const wallet = await signInTestWallet(page, { bearer: 'e2e-admin-restore' })
    const reportId = `r-${crypto.randomUUID()}`
    await serveOrgReads(page, {
      OrgReports: (vars) =>
        vars.status === 'RESOLVED'
          ? { orgReports: [orgReport({ id: reportId, status: 'RESOLVED', resolution: 'TAKE_DOWN', org: orgSummary({ id: 'org-bad', handle: 'fake-acme', name: 'Fake Acme' }) })] }
          : { orgReports: [orgReport({ id: 'r-deleted', org: null, orgId: 'org-gone' })] },
    })
    await fixtureStub({ match: 'mutation ResolveOrgReport', variables: reportId, response: { data: { resolveOrgReport: orgReport({ id: reportId, status: 'RESOLVED', resolution: 'RESTORE' }) } } })
    await page.goto('/admin/reports')
    const open = page.getByRole('list', { name: 'Reports' }).getByRole('listitem')
    await expect(open.getByRole('button', { name: 'Dismiss' })).toBeVisible({ timeout: 30_000 })
    await expect(open.getByRole('button', { name: 'Take down' })).toHaveCount(0)
    await expect(open.getByRole('button', { name: 'Release the handle' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Resolved', exact: true }).click()
    const report = page.getByRole('list', { name: 'Reports' }).getByRole('listitem').filter({ hasText: 'Fake Acme' })
    await report.getByRole('button', { name: 'Restore' }).click()
    const confirm = page.getByRole('dialog', { name: 'Restore Fake Acme?' })
    await confirm.getByRole('button', { name: 'Restore Fake Acme' }).click()
    expect(await signedWrite(wallet, 'resolveOrgReport', null, (v) => v.reportId === reportId)).toEqual({ reportId, resolution: 'RESTORE' })
  })
})
