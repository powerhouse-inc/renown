import { test, expect } from '@playwright/test'
import { identicon } from '../utils/identicon'
import { fixtureStub, STUB_SWITCHBOARD_URL } from './support/stub-switchboard-client'

// Public profile pages and media URLs, server-rendered against the stub
// switchboard. Uses fixtures with ids no other spec uses (fixtures survive
// the resets renown-writes.spec.ts does), so it runs in parallel.
const ADDRESS = '0x5e00000000000000000000000000000000000001'
const PROFILE = {
  documentId: 'doc-pages-1',
  username: 'pages-user',
  ethAddress: ADDRESS,
  userImage: null,
  displayName: 'Pat Pages',
  handle: 'pat-pages',
  bio: 'Line one\nLine two',
  links: [
    { id: 'l1', label: 'Site', url: 'https://pat.example' },
    { id: 'l2', label: 'Bad', url: 'javascript:alert(1)' },
  ],
  avatar: `attachment://v1:${'f'.repeat(64)}`,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-10-09T10:00:00.000Z',
}
const NO_HANDLE = { ...PROFILE, documentId: 'doc-pages-2', handle: null, avatar: null, displayName: null, username: 'plain-user', ethAddress: '0x5e00000000000000000000000000000000000002' }

test.beforeAll(async () => {
  const users = (profile: unknown) => ({ data: { renownUsers: [profile] } })
  await fixtureStub({ match: 'renownUsers', variables: '"pat-pages"', response: users(PROFILE) })
  await fixtureStub({ match: 'renownUsers', variables: '"doc-pages-1"', response: users(PROFILE) })
  await fixtureStub({ match: 'renownUsers', variables: ADDRESS, response: users(PROFILE) })
  await fixtureStub({ match: 'renownUsers', variables: '"doc-pages-2"', response: users(NO_HANDLE) })
})

test.describe('public profile', () => {
  test('/@handle renders the identity, safe links only, and link-preview meta', async ({ page }) => {
    const response = await page.goto('/@pat-pages')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Pat Pages' })).toBeVisible()
    await expect(page.getByText('@pat-pages')).toBeVisible()
    await expect(page.getByText('Line one')).toBeVisible()
    await expect(page.getByRole('link', { name: /Site/ })).toHaveAttribute('href', 'https://pat.example')
    await expect(page.getByRole('link', { name: /Bad/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Copy address' })).toContainText(ADDRESS)
    await expect(page.locator('img[alt="Pat Pages"]').first()).toHaveAttribute('src', '/media/doc-pages-1/avatar')
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Pat Pages (@pat-pages)')
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/media\/doc-pages-1\/avatar$/)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/@pat-pages$/)
  })

  test('document-id and address URLs redirect to /@handle', async ({ request }) => {
    for (const path of ['/profile/doc-pages-1', `/profile/${ADDRESS}`, '/@PAT-PAGES']) {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status(), path).toBe(307)
      expect(response.headers().location).toBe('/@pat-pages')
    }
  })

  test('a profile without a handle stays on its document URL with a generated avatar', async ({ page }) => {
    const response = await page.goto('/profile/doc-pages-2')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'plain-user' })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Generated avatar' })).toBeVisible()
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(0)
  })

  test('an unknown handle is a 404 page', async ({ page }) => {
    const response = await page.goto('/@nobody-here-404')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: 'Profile not found' })).toBeVisible()
  })
})

test.describe('/media', () => {
  test('redirects a set avatar to the signed storage URL with the public cache policy', async ({ request }) => {
    const response = await request.get('/media/stub-avatar-doc/avatar', { maxRedirects: 0 })
    expect(response.status()).toBe(302)
    expect(response.headers().location).toMatch(new RegExp(`^${STUB_SWITCHBOARD_URL}/__stub/s3/[0-9a-f]{64}$`))
    expect(response.headers()['cache-control']).toBe('public, max-age=60, stale-while-revalidate=240')
    const image = await request.get('/media/stub-avatar-doc/avatar')
    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toBe('image/png')
  })

  for (const [label, path] of [
    ['an unset avatar', '/media/doc-without-avatar/avatar'],
    ['an unknown field', '/media/stub-avatar-doc/cover'],
    ['a malformed document id', '/media/bad%20id/avatar'],
  ]) {
    test(`404s for ${label}`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status()).toBe(404)
      expect(response.headers()['cache-control']).toBe('public, max-age=60')
    })
  }
})

test('identicons are deterministic per address and mirrored', () => {
  const a = identicon('0xAbC0000000000000000000000000000000000001')
  expect(identicon('0xabc0000000000000000000000000000000000001')).toEqual(a)
  expect(identicon('0xabc0000000000000000000000000000000000002')).not.toEqual(a)
  for (let row = 0; row < 5; row++) {
    expect(a.cells[row * 5]).toBe(a.cells[row * 5 + 4])
    expect(a.cells[row * 5 + 1]).toBe(a.cells[row * 5 + 3])
  }
})
