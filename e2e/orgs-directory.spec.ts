import { peopleCacheControl } from '../utils/cache-control'
import { test, expect, type Route } from '@playwright/test'
import { fixtureStub, graphqlError, STUB_SWITCHBOARD_URL } from './support/stub-switchboard-client'
import { DIRECTORY_ORGS, installDirectoryFixture, orgSummary } from './support/org-fixtures'

const MORE = {
  ...orgSummary({ id: 'org-dir-3', handle: 'acme-dir-more', name: 'Acme Dir More' }),
  bio: null,
  memberCount: 2,
  archived: false,
  takenDown: false,
  notAffiliatedWith: null,
}

test.beforeAll(async () => {
  await installDirectoryFixture()
  await fixtureStub({
    match: 'query OrgSearch',
    variables: '"query":"acme-dir"',
    response: { data: { organizationSearch: { items: [DIRECTORY_ORGS[0]], next: 'cursor-2' } } },
  })
  await fixtureStub({
    match: 'query OrgSearch',
    variables: '"query":"nomatch-dir"',
    response: { data: { organizationSearch: { items: [], next: null } } },
  })
  await fixtureStub({
    match: 'query OrgSearch',
    variables: '"query":"down-dir"',
    response: graphqlError('down', 'SERVICE_UNAVAILABLE'),
  })
})

test.describe('/orgs', () => {
  test('lists the listed organisations with their verification', async ({ page }) => {
    await page.goto('/orgs')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Organisations on Renown' }),
    ).toBeVisible()
    const list = page.getByRole('list', { name: 'Organisations' })
    await expect(list.getByRole('listitem')).toHaveCount(2)
    await expect(
      list.getByRole('link', { name: /^Generated avatar Acme Directory Works/ }),
    ).toHaveAttribute('href', '/@acme-directory')
    await expect(list.getByText('Verified: acme-directory.example')).toBeVisible()
    await expect(list.getByText('Unverified organisation')).toBeVisible()
    await expect(
      list.getByText('Not affiliated with the verified Acme Directory Works'),
    ).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Create an organisation' })).toHaveAttribute(
      'href',
      '/org/new',
    )
  })

  test('searches by query, pages with Load more, and is not indexed', async ({ page }) => {
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
      const body = route.request().postDataJSON() as {
        query: string
        variables: { after?: string }
      }
      if (body.query.includes('query OrgSearch') && body.variables.after === 'cursor-2') {
        return route.fulfill({
          json: { data: { organizationSearch: { items: [MORE], next: null } } },
        })
      }
      return route.continue()
    })
    await page.goto('/orgs?q=acme-dir')
    await expect(
      page.getByRole('searchbox', { name: 'Search organisations by name or handle' }),
    ).toHaveValue('acme-dir')
    await expect(page.getByRole('status').filter({ hasText: 'matching' })).toHaveText(
      '1+ organisations matching “acme-dir”',
    )
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await page.getByRole('button', { name: 'Load more organisations' }).click()
    await expect(
      page.getByRole('list', { name: 'Organisations' }).getByRole('listitem'),
    ).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Load more organisations' })).toHaveCount(0)
  })

  test('says when nothing matches, when the directory is down, and when a query is too short', async ({
    page,
  }) => {
    await page.goto('/orgs?q=nomatch-dir')
    await expect(
      page.getByRole('heading', { name: 'No organisation matches “nomatch-dir”' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Show all organisations' })).toHaveAttribute(
      'href',
      '/orgs',
    )
    await page.waitForLoadState('networkidle')
    await page.goto('/orgs?q=down-dir').catch(() => undefined)
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'The organisation directory is unavailable',
    )
    await page.goto('/orgs?q=a')
    await expect(page.getByText('Type at least 2 characters.')).toBeVisible()
    await expect(
      page.getByRole('list', { name: 'Organisations' }).getByRole('listitem'),
    ).toHaveCount(2)
  })

  test('is linked from the footer and listed in the sitemap', async ({ page, request }) => {
    await page.goto('/trust')
    await expect(
      page.getByRole('contentinfo').getByRole('link', { name: 'Organisations' }),
    ).toHaveAttribute('href', '/orgs')
    expect(await (await request.get('/sitemap.xml')).text()).toContain('/orgs</loc>')
  })

  test('answers 503 with Retry-After when the read fails; cache-control values', async ({
    request,
  }) => {
    const down = await request.get('/orgs?q=down-dir')
    expect(down.status()).toBe(503)
    expect(down.headers()['retry-after']).toBe('30')
    // The dev server overrides Cache-Control, so the values are asserted on the helper the page uses.
    expect(peopleCacheControl('acme-dir', true)).toBe('no-store')
    expect(peopleCacheControl('', true)).toContain('public')
    expect(peopleCacheControl('', false)).toBe('no-store')
  })
})
