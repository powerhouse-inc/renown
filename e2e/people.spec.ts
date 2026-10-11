import { test, expect, type Page, type Route } from '@playwright/test'
import { appendPeople, isSearchable, parsePeopleQuery, type Person } from '../services/people'
import { fixtureStub, removeFixture, STUB_SWITCHBOARD_URL } from './support/stub-switchboard-client'
import { attachScreenshots, expectNoSeriousA11yViolations, layoutShift, useTheme, type Theme } from './support/site'

// /people searches renownUserSearch server-side for ?q= (answered by stub
// fixtures with queries no other spec uses) and from the browser as the
// visitor types (answered here with page.route).

const person = (key: string, extra: Partial<Person> = {}): Person => ({
  documentId: `doc-people-${key}`,
  ethAddress: `0x${key.padEnd(40, '0').slice(0, 40)}`,
  handle: key,
  displayName: `Person ${key}`,
  username: null,
  bio: `Bio of ${key}`,
  avatar: null,
  userImage: null,
  ...extra,
})

const page1 = Array.from({ length: 24 }, (_, i) => person(`qa${String(i).padStart(2, '0')}`))
const page2 = [person('qa24'), person('qa25')]

/** Answers the browser's searches from `pages` (query -> first page; "after" -> next page). */
async function serveSearch(page: Page, answer: (q: string, after: string | null) => { status?: number; items?: Person[]; next?: string | null }) {
  const queries: { q: string; after: string | null }[] = []
  await page.route(`${STUB_SWITCHBOARD_URL}/graphql`, async (route: Route) => {
    const body = route.request().postDataJSON() as { query: string; variables: { q: string; after: string | null } }
    if (!body.query.includes('renownUserSearch')) return route.continue()
    queries.push(body.variables)
    const { status, items = [], next = null } = answer(body.variables.q, body.variables.after)
    if (status) return route.fulfill({ status, body: 'down' })
    return route.fulfill({ json: { data: { renownUserSearch: { items, next } } } })
  })
  return queries
}

/** Opens /people and waits until it is hydrated (the session-dependent button shows), so typing reaches React. */
async function openPeople(page: Page): Promise<void> {
  await page.goto('/people')
  await expect(page.getByRole('button', { name: 'Sign in to list yourself' })).toBeVisible({ timeout: 30_000 })
}

test.describe('people search helpers', () => {
  test('parsePeopleQuery trims, takes the first value and keeps 40 characters', () => {
    expect(parsePeopleQuery('  ada ')).toBe('ada')
    expect(parsePeopleQuery(['ada', 'bob'])).toBe('ada')
    expect(parsePeopleQuery(undefined)).toBe('')
    expect(parsePeopleQuery('a'.repeat(50))).toBe('a'.repeat(40))
    expect(parsePeopleQuery('😀'.repeat(41))).toBe('😀'.repeat(40))
    expect(isSearchable('a')).toBe(false)
    expect(isSearchable('😀😀')).toBe(true)
    expect(appendPeople([person('a')], [person('a'), person('b')]).map((p) => p.handle)).toEqual(['a', 'b'])
  })
})

test.describe('/people', () => {
  test('renders ?q= on the server, noindex, with profile cards linking to profiles', async ({ page }) => {
    await fixtureStub({
      id: 'people-ssr',
      match: 'renownUserSearch',
      variables: '"q":"ssrqa"',
      response: { data: { renownUserSearch: { items: [person('ssrqa', { displayName: 'Server Person' })], next: null } } },
    })
    const response = await page.request.get('/people?q=ssrqa')
    expect(await response.text()).toContain('Server Person')
    await page.goto('/people?q=ssrqa')
    await expect(page.getByRole('searchbox', { name: 'Search people by name or handle' })).toHaveValue('ssrqa')
    await expect(page.getByRole('status').filter({ hasText: '1 person matching' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Server Person/ })).toHaveAttribute('href', '/@ssrqa')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/people$/)
    // Each test drops its own fixture: an afterAll in another worker would pull it from under a running test.
    await removeFixture('people-ssr')
  })

  test('without a query: indexable, explains opt-in, offers sign-in to list yourself', async ({ page }) => {
    await page.goto('/people')
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Nobody is listed by default' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in to list yourself' })).toBeVisible({ timeout: 30_000 })
  })

  test('searches as you type (debounced), keeps ?q= in sync and loads more', async ({ page }) => {
    const queries = await serveSearch(page, (q, after) => (after ? { items: page2 } : q === 'qa' ? { items: page1, next: 'cursor-qa' } : {}))
    await openPeople(page)
    const box = page.getByRole('searchbox', { name: 'Search people by name or handle' })
    await box.pressSequentially('q')
    await expect(page.getByText('Type at least 2 characters.')).toBeVisible()
    await box.pressSequentially('a')
    await expect(page.getByRole('list', { name: 'People' }).getByRole('listitem')).toHaveCount(24)
    expect(queries).toEqual([{ q: 'qa', after: null }])
    await expect(page).toHaveURL(/\/people\?q=qa$/)
    await expect(page.getByRole('status').filter({ hasText: '24+ people matching “qa”' })).toBeVisible()

    await page.getByRole('button', { name: 'Load more people' }).click()
    await expect(page.getByRole('list', { name: 'People' }).getByRole('listitem')).toHaveCount(26)
    await expect(page.getByRole('button', { name: 'Load more people' })).toHaveCount(0)
    expect(queries.at(-1)).toEqual({ q: 'qa', after: 'cursor-qa' })
  })

  test('nobody matching, then an outage with retry', async ({ page }) => {
    let down = false
    await serveSearch(page, () => (down ? { status: 500 } : {}))
    await openPeople(page)
    const box = page.getByRole('searchbox', { name: 'Search people by name or handle' })
    await box.fill('zz-nobody')
    await expect(page.getByRole('heading', { name: 'Nobody matches yet' })).toBeVisible()
    down = true
    await box.fill('zz-down')
    await expect(page.getByRole('heading', { name: 'People search is unavailable' })).toBeVisible({ timeout: 15_000 })
    down = false
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByRole('heading', { name: 'Nobody matches yet' })).toBeVisible()
  })

  test('the search survives leaving the page and coming back', async ({ page }) => {
    const alpha = { items: [person('qaalpha', { displayName: 'Alpha Person' })], next: null }
    await fixtureStub({ id: 'people-back', match: 'renownUserSearch', variables: '"q":"qaalpha"', response: { data: { renownUserSearch: alpha } } })
    await serveSearch(page, (q) => (q === 'qaalpha' ? alpha : {}))
    await openPeople(page)
    const box = page.getByRole('searchbox', { name: 'Search people by name or handle' })
    await box.fill('qaalpha')
    await expect(page.getByText('Alpha Person')).toBeVisible()
    await expect(page).toHaveURL(/\/people\?q=qaalpha$/)
    await page.getByRole('banner').getByRole('link', { name: 'Apps' }).click()
    await expect(page).toHaveURL(/\/apps$/, { timeout: 30_000 })
    await page.goBack()
    await expect(box).toHaveValue('qaalpha')
    await expect(page.getByText('Alpha Person')).toBeVisible()
    await removeFixture('people-back')
  })

  for (const theme of ['light', 'dark'] as Theme[]) {
    test(`no serious axe violations, no layout shift (${theme})`, async ({ page }, testInfo) => {
      await useTheme(page, theme)
      await serveSearch(page, () => ({ items: page1.slice(0, 7), next: 'more' }))
      await openPeople(page)
      expect(await layoutShift(page)).toBeLessThan(0.01)
      await expectNoSeriousA11yViolations(page)
      await page.getByRole('searchbox', { name: 'Search people by name or handle' }).fill('qa')
      await expect(page.getByRole('list', { name: 'People' }).getByRole('listitem')).toHaveCount(7)
      await expectNoSeriousA11yViolations(page)
      await attachScreenshots(page, testInfo, `people-${theme}`)
    })
  }
})
