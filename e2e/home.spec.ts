import { test, expect } from '@playwright/test'
import { fixtureStub, removeFixture } from './support/stub-switchboard-client'
import { attachScreenshots, expectNoSeriousA11yViolations, useTheme } from './support/site'

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

test.afterAll(async () => {
  await removeFixture(FIXTURE)
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

for (const theme of ['light', 'dark'] as const) {
  test(`has no serious axe violations (${theme})`, async ({ page }, testInfo) => {
    await featured({ response: { data: { appProfiles: { items: [1, 2, 3, 4, 5, 6].map(app), next: null } } } })
    await useTheme(page, theme)
    await page.goto('/')
    await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 30_000 })
    await expectNoSeriousA11yViolations(page)
    await attachScreenshots(page, testInfo, `home-${theme}`)
  })
}
