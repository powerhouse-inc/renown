import { test, expect, type Page } from '@playwright/test'
import { fixtureStub, removeFixture } from './support/stub-switchboard-client'
import { attachScreenshots, expectNoSeriousA11yViolations, layoutShift, useTheme } from './support/site'
import { appendApps, appsHref, parseCategory, sameCategory } from '../utils/app-directory'

// /apps reads appProfiles(limit: 24, …) and appProfileCategories, server-side
// on load and from the browser on filter / load more; both reach the stub. No
// other page uses limit 24 or the categories query, but the tests here swap
// those fixtures, so they run one at a time.
test.describe.configure({ mode: 'serial' })

const did = (key: string) => `did:key:z6MkDir${key}${'x'.repeat(40 - key.length)}`
const app = (key: string, category: string | null = null) => ({
  appDid: did(key),
  documentId: `stub-dir-${key}`,
  name: `Directory ${key}`,
  tagline: `Tagline ${key}`,
  logo: null,
  website: null,
  publisherDid: null,
  description: null,
  category,
  logoRef: null,
  coverRef: null,
  links: [],
})
const page = (items: unknown[], next: string | null = null) => ({ data: { appProfiles: { items, next } } })

const IDS: string[] = []
/** Answers appProfiles(limit: 24) whose variables contain `variables` (e.g. '"category":null'). */
async function apps(id: string, variables: string, entry: { status?: number; response: unknown }): Promise<void> {
  await removeFixture(id)
  IDS.push(id)
  await fixtureStub({ id, match: 'appProfiles(', variables: `"limit":24,${variables}`, ...entry })
}
async function categories(response: unknown): Promise<void> {
  await removeFixture('dir-categories')
  IDS.push('dir-categories')
  await fixtureStub({ id: 'dir-categories', match: 'appProfileCategories', response })
}
const CATEGORIES = { data: { appProfileCategories: [{ category: 'Games', count: 2 }, { category: 'Tools', count: 1 }] } }

test.beforeEach(async () => {
  await categories(CATEGORIES)
  await apps('dir-all', '"after":null,"category":null', { response: page([app('A1', 'Games'), app('A2', 'Tools'), app('A3', 'Games')]) })
  await apps('dir-games', '"after":null,"category":"Games"', { response: page([app('A1', 'Games'), app('A3', 'Games')]) })
})

test.afterAll(async () => {
  for (const id of IDS) await removeFixture(id)
})

const grid = (p: Page) => p.getByRole('list', { name: /apps$/i })

test.describe('directory helpers', () => {
  test('parseCategory trims, takes the first value and treats blank or oversized as all', () => {
    expect(parseCategory('  Games ')).toBe('Games')
    expect(parseCategory(['Tools', 'Games'])).toBe('Tools')
    expect(parseCategory('   ')).toBeNull()
    expect(parseCategory(undefined)).toBeNull()
    expect(parseCategory('x'.repeat(41))).toBeNull()
    expect(sameCategory('games', 'Games')).toBe(true)
    expect(sameCategory(null, null)).toBe(true)
    expect(appsHref('Dev & Ops')).toBe('/apps?category=Dev%20%26%20Ops')
    expect(appsHref(null)).toBe('/apps')
  })

  test('appendApps skips apps already listed', () => {
    expect(appendApps([app('A1')], [app('A1'), app('A2')]).map((a) => a.appDid)).toEqual([did('A1'), did('A2')])
  })
})

test('renders the first page, the category chips and the page metadata', async ({ page: p }) => {
  const response = await p.goto('/apps')
  expect(response?.status()).toBe(200)
  await expect(p).toHaveTitle('Apps - Renown')
  await expect(p.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/apps$/)
  await expect(p.getByRole('heading', { level: 1, name: 'Apps on Renown' })).toBeVisible()
  const chips = p.getByRole('navigation', { name: 'App categories' })
  await expect(chips.getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page')
  // Link text utilities must beat the base `a { color: inherit }` (white on the primary fill).
  await expect(chips.getByRole('link', { name: 'All' })).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(chips.getByRole('link', { name: 'Games, 2 apps' })).toHaveAttribute('href', '/apps?category=Games')
  await expect(chips.getByRole('link', { name: 'Tools, 1 app' })).toBeVisible()
  await expect(grid(p).getByRole('listitem')).toHaveCount(3)
  await expect(grid(p).getByRole('link', { name: /Directory A2/ })).toHaveAttribute('href', `/app/${did('A2')}`)
  await expect(p.getByRole('heading', { level: 2, name: 'Directory A1' })).toBeVisible()
  await expect(p.getByRole('button', { name: 'Load more apps' })).toHaveCount(0)
})

test('a chip filters in place (shallow route + fetch), and back restores all apps', async ({ page: p }) => {
  await p.goto('/apps')
  await expect(grid(p).getByRole('listitem')).toHaveCount(3)
  await p.evaluate(() => ((window as { __noReload?: boolean }).__noReload = true))
  await p.getByRole('link', { name: 'Games, 2 apps' }).click()
  await expect(p).toHaveURL(/\/apps\?category=Games$/)
  await expect(grid(p).getByRole('listitem')).toHaveCount(2)
  await expect(p.getByRole('link', { name: 'Games, 2 apps' })).toHaveAttribute('aria-current', 'page')
  await expect(p.getByRole('main').getByRole('status')).toHaveText('2 apps in Games')
  expect(await p.evaluate(() => (window as { __noReload?: boolean }).__noReload)).toBe(true)
  await p.goBack()
  await expect(p).toHaveURL(/\/apps$/)
  await expect(grid(p).getByRole('listitem')).toHaveCount(3)
  await expect(p.getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page')
})

test('a category in the URL is matched case-insensitively and rendered on the server', async ({ page: p }) => {
  await apps('dir-games-lower', '"after":null,"category":"games"', { response: page([app('A1', 'Games'), app('A3', 'Games')]) })
  await p.goto('/apps?category=%20games%20')
  await expect(p.getByRole('link', { name: 'Games, 2 apps' })).toHaveAttribute('aria-current', 'page')
  await expect(grid(p).getByRole('listitem')).toHaveCount(2)
})

test('Load more appends the next page, and a failed page can be retried', async ({ page: p }) => {
  await apps('dir-all', '"after":null,"category":null', { response: page([app('A1'), app('A2')], 'cursor-2') })
  await apps('dir-all-2', '"after":"cursor-2","category":null', { status: 500, response: { error: 'boom' } })
  await p.goto('/apps')
  await expect(grid(p).getByRole('listitem')).toHaveCount(2)
  await p.getByRole('button', { name: 'Load more apps' }).click()
  await expect(p.getByRole('main').getByRole('alert')).toContainText("More apps didn't load")
  await expect(grid(p).getByRole('listitem')).toHaveCount(2)

  await apps('dir-all-2', '"after":"cursor-2","category":null', { response: page([app('A2'), app('A4')], null) })
  await p.getByRole('button', { name: 'Load more apps' }).click()
  await expect(grid(p).getByRole('listitem')).toHaveCount(3)
  await expect(grid(p).getByRole('link', { name: /Directory A4/ })).toBeVisible()
  await expect(p.getByRole('button', { name: 'Load more apps' })).toHaveCount(0)
})

test('Load more stays usable after a chip and back to all, and the stale category answer is dropped', async ({ page: p }) => {
  await apps('dir-all', '"after":null,"category":null', { response: page([app('A1'), app('A2')], 'cursor-2') })
  await apps('dir-all-2', '"after":"cursor-2","category":null', { response: page([app('A4')], null) })
  await p.goto('/apps')
  await expect(grid(p).getByRole('listitem')).toHaveCount(2)
  // Hold the next-page and the Games answers back until after the user has left and returned.
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  const allFirstPages: string[] = []
  await p.route('**/graphql/**', async (route) => {
    const body = route.request().postData() ?? ''
    if (body.includes('"after":null') && body.includes('"category":null')) allFirstPages.push(body)
    if (body.includes('"after":"cursor-2"') || body.includes('"category":"Games"')) await gate
    await route.continue()
  })
  await p.getByRole('button', { name: 'Load more apps' }).click()
  await expect(p.getByRole('button', { name: 'Loading…' })).toBeDisabled()
  await p.getByRole('link', { name: 'Games, 2 apps' }).click()
  await expect(p).toHaveURL(/category=Games$/)
  // Back to the category already shown (a chip push keeps the page, unlike a dev-mode history pop).
  await p.getByRole('link', { name: 'All' }).click()
  await expect(p).toHaveURL(/\/apps$/)
  const gamesAnswered = p.waitForResponse((r) => (r.request().postData() ?? '').includes('"category":"Games"'))
  release()
  await gamesAnswered
  await expect(p.getByRole('button', { name: 'Load more apps' })).toBeEnabled()
  await expect(grid(p)).toHaveAttribute('aria-label', 'All apps')
  await p.getByRole('button', { name: 'Load more apps' }).click()
  await expect(grid(p).getByRole('listitem')).toHaveCount(3)
  // Had the late Games answer been applied, the list would have flipped to Games and refetched all apps.
  expect(allFirstPages).toEqual([])
})

test('a retry is ended only by its own answer, not by a late answer from before it', async ({ page: p }) => {
  test.setTimeout(60_000)
  await apps('dir-all', '"after":null,"category":null', { status: 500, response: { error: 'boom' } })
  await p.goto('/apps')
  const outage = p.getByRole('main').getByRole('alert')
  await expect(outage).toContainText('The app directory is unavailable')
  // The first retry hangs; the second retry hangs until the end.
  let releaseFirst: () => void = () => {}
  let releaseLast: () => void = () => {}
  const first = new Promise<void>((resolve) => (releaseFirst = resolve))
  const last = new Promise<void>((resolve) => (releaseLast = resolve))
  let allReads = 0
  let firstAnswered = false
  await p.route('**/graphql/**', async (route) => {
    const body = route.request().postData() ?? ''
    if (body.includes('"after":null') && body.includes('"category":null')) {
      const read = ++allReads
      if (read === 1) {
        await first
        await route.fulfill({ response: await route.fetch() })
        firstAnswered = true
        return
      }
      if (read === 3) await last
    }
    await route.continue()
  })
  await p.getByRole('button', { name: 'Try again' }).click()
  await expect(outage).toHaveCount(0)
  // Games loads while the retry is still out; back on All the read fails again.
  await p.getByRole('link', { name: 'Games, 2 apps' }).click()
  await expect(grid(p).getByRole('listitem')).toHaveCount(2)
  await p.getByRole('link', { name: 'All' }).click()
  await expect(outage).toContainText('The app directory is unavailable')
  await p.getByRole('button', { name: 'Try again' }).click()
  await expect(outage).toHaveCount(0)
  // The first retry's answer lands now: the second retry is still out, so the page keeps loading.
  expect(allReads).toBe(3)
  releaseFirst()
  await expect.poll(() => firstAnswered).toBe(true)
  await p.waitForTimeout(500)
  await expect(outage).toHaveCount(0)
  await expect(p.getByRole('main').getByRole('status')).toHaveText('Loading apps…')
  await apps('dir-all', '"after":null,"category":null', { response: page([app('A1')]) })
  releaseLast()
  await expect(grid(p).getByRole('listitem')).toHaveCount(1)
})

test('a category read that never answers ends in the outage notice', async ({ page: p }) => {
  test.setTimeout(60_000)
  await p.goto('/apps')
  await expect(grid(p).getByRole('listitem')).toHaveCount(3)
  await p.route('**/graphql/**', async (route) => {
    if ((route.request().postData() ?? '').includes('"category":"Games"')) return // hangs
    await route.continue()
  })
  await p.getByRole('link', { name: 'Games, 2 apps' }).click()
  await expect(p.getByRole('main').getByRole('alert')).toContainText('The app directory is unavailable', { timeout: 20_000 })
})

test('app logos load lazily', async ({ page: p }) => {
  await apps('dir-all', '"after":null,"category":null', { response: page([app('A0'), app('A00'), app('A000'), { ...app('A1'), logoRef: `attachment://v1:${'3'.repeat(64)}` }]) })
  // Serve the logo, or the broken image would fall back to a monogram.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
  await p.route('**/media/**', (route) => route.fulfill({ contentType: 'image/png', body: png }))
  await p.goto('/apps')
  const logo = grid(p).getByRole('img', { name: 'Directory A1 logo' })
  await expect(logo).toHaveAttribute('loading', 'lazy')
  await expect(logo).toHaveAttribute('decoding', 'async')
})

test('the first row of app covers loads eagerly and later ones lazily', async ({ page: p }) => {
  const withCover = (key: string) => ({ ...app(key), coverRef: `attachment://v1:${'4'.repeat(64)}` })
  await apps('dir-all', '"after":null,"category":null', { response: page(['B1', 'B2', 'B3', 'B4'].map(withCover)) })
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
  await p.route('**/media/**', (route) => route.fulfill({ contentType: 'image/png', body: png }))
  await p.goto('/apps')
  const covers = grid(p).locator('li img[alt=""]')
  await expect(covers).toHaveCount(4)
  for (const i of [0, 1, 2]) {
    await expect(covers.nth(i)).toHaveAttribute('loading', 'eager')
    await expect(covers.nth(i)).toHaveAttribute('fetchpriority', 'high')
  }
  await expect(covers.nth(3)).toHaveAttribute('loading', 'lazy')
  // The first cover (the LCP image) is preloaded from <head>; the plain directory (no covers) preloads nothing.
  const html = await (await p.request.get('/apps')).text()
  const head = html.slice(0, html.indexOf('</head>'))
  expect(head).toMatch(new RegExp(`<link rel="preload" as="image" href="/media/stub-dir-B1/cover\\?v=${'4'.repeat(12)}" fetchPriority="high"[^>]*>`, 'i'))
  expect(head.match(/rel="preload" as="image"/g)).toHaveLength(1)
})

test('a directory whose first app has no cover preloads no image', async ({ page: p }) => {
  const html = await (await p.request.get('/apps')).text()
  expect(html.slice(0, html.indexOf('</head>'))).not.toContain('as="image"')
})

test('an empty category invites listing an app on Vetra', async ({ page: p }) => {
  await apps('dir-empty', '"after":null,"category":"Empty"', { response: page([]) })
  await p.goto('/apps?category=Empty')
  await expect(p.getByRole('heading', { level: 2, name: 'No apps here yet' })).toBeVisible()
  await expect(p.getByRole('link', { name: 'List your app on Vetra' })).toHaveAttribute('href', 'https://www.vetra.io')
  await expect(p.getByRole('link', { name: 'Show all apps' })).toHaveAttribute('href', '/apps')
})

test('an outage answers 200 with a notice, and Try again recovers', async ({ page: p }) => {
  await apps('dir-all', '"after":null,"category":null', { status: 500, response: { error: 'boom' } })
  await categories({ data: null, errors: [{ message: 'Stats are temporarily unavailable', extensions: { code: 'SERVICE_UNAVAILABLE' } }] })
  const response = await p.goto('/apps')
  expect(response?.status()).toBe(200)
  await expect(p.getByRole('main').getByRole('alert')).toContainText('The app directory is unavailable')
  await expect(p.getByRole('navigation', { name: 'App categories' })).toHaveCount(0)

  await apps('dir-all', '"after":null,"category":null', { response: page([app('A1')]) })
  await p.getByRole('button', { name: 'Try again' }).click()
  await expect(grid(p).getByRole('listitem')).toHaveCount(1)
  await expect(p.getByRole('main').getByRole('alert')).toHaveCount(0)
})

test('late data never shifts the layout', async ({ page: p }) => {
  await p.goto('/apps')
  await expect(grid(p).getByRole('listitem')).toHaveCount(3)
  expect(await layoutShift(p)).toBeLessThan(0.01)
})

for (const theme of ['light', 'dark'] as const) {
  test(`has no serious axe violations (${theme})`, async ({ page: p }, testInfo) => {
    await useTheme(p, theme)
    await p.goto('/apps')
    await expect(grid(p).getByRole('listitem')).toHaveCount(3)
    await expectNoSeriousA11yViolations(p)
    await attachScreenshots(p, testInfo, `apps-${theme}`)
  })
}
