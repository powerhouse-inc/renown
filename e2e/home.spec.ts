import { test, expect } from '@playwright/test'
import { fixtureStub, removeFixture } from './support/stub-switchboard-client'
import { attachScreenshots, expectNoSeriousA11yViolations, layoutShift, useTheme } from './support/site'
import { DEFAULT_PULSE_MIN, pulseMin, visibleMetrics } from '../utils/pulse'
import { listingCacheControl } from '../utils/cache-control'

// Every homepage load in the suite lives in this file: its tests swap the
// appProfiles fixture the SSR reads, so they run one at a time and no other
// spec may load "/" without an auth query.
test.describe.configure({ mode: 'serial' })

const FIXTURE = 'home-featured'
const did = (n: number) => `did:key:z6MkHomeApp${n}${'x'.repeat(36)}`
const app = (n: number) => ({
  appDid: did(n),
  documentId: `stub-home-${n}`,
  name: `Home App ${n}`,
  tagline: `Tagline ${n}`,
  logo: null,
  website: null,
  publisherDid: null,
  description: null,
  category: n % 2 ? 'Productivity' : null,
  logoRef: null,
  coverRef: null,
  links: [],
})

/** Makes the homepage's appProfiles(limit: 6) read answer with `entry`. */
async function featured(entry: { status?: number; response: unknown }): Promise<void> {
  await removeFixture(FIXTURE)
  await fixtureStub({ id: FIXTURE, match: 'appProfiles(', variables: '"limit":6', ...entry })
}

const PULSE = 'home-pulse'
/** Prod on 2026-10-09: two counts reach the default threshold of 25. */
const PROD_PULSE = { identities: 245, apps: 1, activeCredentials: 168, activeUsers30d: 0, updatedAt: '2026-10-09T10:00:00.000Z' }

/** Makes the homepage's renownNetworkStats read answer with `entry`. */
async function pulse(entry: { status?: number; response: unknown }): Promise<void> {
  await removeFixture(PULSE)
  await fixtureStub({ id: PULSE, match: 'renownNetworkStats', ...entry })
}

test.afterAll(async () => {
  await removeFixture(FIXTURE)
  await removeFixture(PULSE)
})

test('renders the pitch, the CTAs and up to six featured apps', async ({ page }) => {
  await featured({ response: { data: { appProfiles: { items: [1, 2, 3, 4].map(app), next: null } } } })
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: 'One identity for the Powerhouse network' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create your Renown ID' }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: 'Build with Renown' }).first()).toHaveAttribute('href', '/developers')
  const section = page.getByRole('region', { name: 'Apps that sign you in with Renown' })
  await expect(section.getByRole('listitem')).toHaveCount(4)
  await expect(section.getByRole('link', { name: /Home App 1/ })).toHaveAttribute('href', `/app/${did(1)}`)
  await expect(section.getByRole('link', { name: 'Browse all apps' })).toHaveAttribute('href', '/apps')
  await expect(page.locator('svg.rn-constellation')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('svg.rn-constellation text')).toHaveCount(4) // monograms of the four apps without logos
  await expect(page.getByRole('link', { name: 'Read the developer guide' })).toHaveAttribute('href', '/developers')
  await expect(page.locator('.shiki').first()).toBeVisible()
  for (const name of ['Renown', 'Vetra', 'Achra', 'Connect', 'Switchboard']) {
    await expect(page.getByRole('region', { name: 'Part of the Powerhouse ecosystem' }).getByRole('link', { name })).toHaveAttribute(
      'href',
      `/ecosystem#${name.toLowerCase()}`,
    )
  }
})

test('hides the featured apps below three, without a gap', async ({ page }) => {
  await featured({ response: { data: { appProfiles: { items: [1, 2].map(app), next: null } } } })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Apps that sign you in with Renown' })).toHaveCount(0)
  await expect(page.locator('svg.rn-constellation text')).toHaveCount(2)
})

test('a backend outage drops the section and never fails the page', async ({ page }) => {
  await featured({ status: 500, response: { error: 'boom' } })
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Apps that sign you in with Renown' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Bring your identity to every app' })).toBeVisible()
})

test('an outage is never cached at the edge; a full page is (policy; dev overrides the header)', () => {
  expect(listingCacheControl(true)).toBe('public, s-maxage=60, stale-while-revalidate=300')
  expect(listingCacheControl(false)).toBe('no-store')
})

test('has canonical, Open Graph and JSON-LD metadata', async ({ page }) => {
  await removeFixture(FIXTURE)
  await page.goto('/')
  await expect(page).toHaveTitle('Renown - One identity for the Powerhouse network')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https?:\/\/[^/]+$/)
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/api\/og\?variant=default$/)
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents()
  const types = ld.map((text) => (JSON.parse(text) as { '@type': string })['@type'])
  expect(types).toEqual(['Organization', 'WebSite'])
})

test.describe('network pulse', () => {
  const region = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'The network right now' })

  test('threshold and metric selection', () => {
    expect(pulseMin(undefined)).toBe(DEFAULT_PULSE_MIN)
    expect(pulseMin('')).toBe(DEFAULT_PULSE_MIN)
    expect(pulseMin('-3')).toBe(DEFAULT_PULSE_MIN)
    expect(pulseMin('ten')).toBe(DEFAULT_PULSE_MIN)
    expect(pulseMin(' 0 ')).toBe(0)
    expect(pulseMin('100')).toBe(100)
    expect(visibleMetrics(PROD_PULSE, 25).map((m) => [m.key, m.value])).toEqual([
      ['identities', 245],
      ['activeCredentials', 168],
    ])
    expect(visibleMetrics(PROD_PULSE, 0)).toHaveLength(4)
    expect(visibleMetrics(PROD_PULSE, 1000)).toEqual([])
    expect(visibleMetrics(null, 0)).toEqual([])
  })

  test('shows only the counts at or above the threshold', async ({ page }) => {
    await pulse({ response: { data: { renownNetworkStats: PROD_PULSE } } })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const pulseRegion = region(page)
    await expect(pulseRegion.getByRole('term')).toHaveText(['people with a Renown ID', 'active app approvals'])
    await expect(page.getByTestId('pulse-identities')).toHaveText('245')
    await expect(page.getByTestId('pulse-activeCredentials')).toHaveText('168')
    await expect(pulseRegion.getByText('apps with a Renown identity')).toHaveCount(0)
  })

  test('is hidden when no count reaches the threshold', async ({ page }) => {
    await pulse({ response: { data: { renownNetworkStats: { ...PROD_PULSE, identities: 24, activeCredentials: 3 } } } })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(region(page)).toHaveCount(0)
  })

  test('is hidden when the stats are unavailable, and the page still answers 200', async ({ page }) => {
    await pulse({ response: { data: null, errors: [{ message: 'Stats are temporarily unavailable', extensions: { code: 'SERVICE_UNAVAILABLE' } }] } })
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(region(page)).toHaveCount(0)
  })

  test('counts up when scrolled into view, without shifting the layout', async ({ page }) => {
    await pulse({ response: { data: { renownNetworkStats: PROD_PULSE } } })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')
    const identities = page.getByTestId('pulse-identities')
    await expect(identities).toHaveText('0')
    const size = async () => {
      const box = await region(page).boundingBox()
      return box && { width: box.width, height: box.height }
    }
    const before = await size()
    await identities.scrollIntoViewIfNeeded()
    await expect(identities).toHaveText('245', { timeout: 5000 })
    expect(await size()).toEqual(before)
    expect(await layoutShift(page)).toBeLessThan(0.01)
  })

  test('shows the final numbers at once under reduced motion', async ({ page }) => {
    await pulse({ response: { data: { renownNetworkStats: PROD_PULSE } } })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForTimeout(300)
    await expect(page.getByTestId('pulse-identities')).toHaveText('245')
  })
})

test('the hero only shows logos stored with Renown, never an external logo URL', async ({ page }) => {
  const external = { ...app(1), logo: 'https://logos.example.com/one.png' }
  const stored = { ...app(2), logoRef: `attachment://v1:${'2'.repeat(64)}` }
  await featured({ response: { data: { appProfiles: { items: [external, stored, app(3)], next: null } } } })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const images = page.locator('svg.rn-constellation image')
  await expect(images).toHaveCount(1)
  await expect(images.first()).toHaveAttribute('href', /^\/media\/stub-home-2\/logo/)
  await expect(page.locator('svg.rn-constellation text')).toHaveCount(2) // monograms for app 1 (external logo) and app 3
})

test('the pillars say how long an approval lasts and what is signed', async ({ page }) => {
  await removeFixture(FIXTURE)
  await page.goto('/')
  const pillars = page.getByRole('region', { name: 'An identity that travels with you' })
  await expect(pillars).toContainText('the approval lasts until it expires or you revoke it')
  await expect(pillars).toContainText('Each document operation an app submits for you carries a signature')
  await expect(pillars).not.toContainText('approve each app once')
})

test('server-rendered pages never carry the analytics profile cookie', async ({ request }) => {
  const wallet = '0x00000000000000000000000000000000c0011e57'
  await featured({ response: { data: { appProfiles: { items: [1, 2, 3].map(app), next: null } } } })
  for (const path of ['/', '/apps', '/trust']) {
    const response = await request.get(path, { headers: { cookie: `op_profile=${wallet}` } })
    expect(response.status(), path).toBe(200)
    const html = await response.text()
    expect(html, path).not.toContain(wallet)
    expect(html, path).not.toContain('initialProfileId')
  }
})

for (const theme of ['light', 'dark'] as const) {
  test(`has no serious axe violations (${theme})`, async ({ page }, testInfo) => {
    await featured({ response: { data: { appProfiles: { items: [1, 2, 3, 4, 5, 6].map(app), next: null } } } })
    await pulse({ response: { data: { renownNetworkStats: { ...PROD_PULSE, apps: 31, activeUsers30d: 1234 } } } })
    await useTheme(page, theme)
    await page.goto('/')
    await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 30_000 })
    await expectNoSeriousA11yViolations(page)
    await attachScreenshots(page, testInfo, `home-${theme}`)
  })
}
