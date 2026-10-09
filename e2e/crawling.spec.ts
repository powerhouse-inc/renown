import { test, expect } from '@playwright/test'
import { fixtureStub, removeFixture } from './support/stub-switchboard-client'
import { renderSitemap } from '../lib/sitemap'

// The sitemap's appProfiles walk uses limit 50; nothing else reads that page size.
const APP_DID = 'did:key:z6MkCrawlAppxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1'

test.beforeAll(async () => {
  await fixtureStub({
    id: 'crawl-sitemap',
    match: 'appProfiles(',
    variables: '"limit":50',
    response: { data: { appProfiles: { items: [{ appDid: APP_DID }], next: null } } },
  })
})

test.afterAll(async () => {
  await removeFixture('crawl-sitemap')
})

test.describe('crawling', () => {
  test('robots.txt allows the site and link previews, and points at the sitemap', async ({ request }) => {
    const response = await request.get('/robots.txt')
    expect(response.headers()['content-type']).toMatch(/text\/plain/)
    const text = await response.text()
    expect(text).toContain('Allow: /api/og')
    expect(text).toContain('Disallow: /api/')
    expect(text).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/)
  })

  test('sitemap.xml lists the static pages and every app profile', async ({ request }) => {
    const response = await request.get('/sitemap.xml')
    expect(response.headers()['content-type']).toMatch(/application\/xml/)
    const xml = await response.text()
    for (const path of ['/developers', '/trust', '/ecosystem', '/apps']) expect(xml).toContain(`${path}</loc>`)
    expect(xml).toContain(`/app/${APP_DID}</loc>`)
  })

  test('renderSitemap escapes XML', () => {
    expect(renderSitemap('https://x.test', ['did:key:a&b'])).toContain('<loc>https://x.test/app/did:key:a&amp;b</loc>')
  })
})

test.describe('per-page metadata', () => {
  for (const [path, title] of [
    ['/developers', 'Developers - Renown'],
    ['/trust', 'Trust - Renown'],
    ['/ecosystem', 'Ecosystem - Renown'],
  ]) {
    test(`${path} has title, description, canonical and a default card`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveTitle(title)
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{40,}/)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${path}$`))
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/api\/og\?variant=default$/)
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
    })
  }
})
