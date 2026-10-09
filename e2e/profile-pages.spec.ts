import { test, expect } from '@playwright/test'
import { identicon } from '../utils/identicon'
import { mediaUrl, mediaVersion } from '../services/media'
import { avatarSources } from '../utils/avatar-sources'
import { cancelsOnKey } from '../utils/image-crop'
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
  await fixtureStub({ match: 'renownUsers', variables: '"outage-handle"', status: 500, response: { error: 'boom' } })
  await fixtureStub({ match: 'renownUsers', variables: '"doc-pages-outage"', status: 500, response: { error: 'boom' } })
})

test.describe('public profile', () => {
  test('/@handle renders the identity, safe links only, and link-preview meta', async ({ page, request }) => {
    const response = await page.goto('/@pat-pages')
    expect(response?.status()).toBe(200)
    // The HTML is fetched with `request` so a dev-server reload cannot discard it.
    const html = await (await request.get('/@pat-pages')).text()
    await expect(page.getByRole('heading', { name: 'Pat Pages' })).toBeVisible()
    await expect(page.getByText('@pat-pages')).toBeVisible()
    await expect(page.getByText('Line one')).toBeVisible()
    await expect(page.getByRole('link', { name: /Site/ })).toHaveAttribute('href', 'https://pat.example')
    await expect(page.getByRole('link', { name: /Bad/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Copy address' })).toContainText(ADDRESS)
    // Server-rendered markup points at /media; client-side the stub has no bytes for
    // this doc, so the avatar then falls through to the identicon.
    expect(html).toContain(`src="/media/doc-pages-1/avatar?v=${'f'.repeat(12)}"`)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Pat Pages (@pat-pages)')
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', new RegExp(`/api/og\\?variant=profile&address=${ADDRESS}$`))
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/@pat-pages$/)
  })

  test('document-id and address URLs redirect to /@handle', async ({ request }) => {
    for (const path of ['/profile/doc-pages-1', `/profile/${ADDRESS}`, '/@PAT-PAGES']) {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status(), path).toBe(307)
      expect(response.headers().location).toBe('/@pat-pages')
    }
  })

  test('a profile without a handle stays on its document URL with a generated avatar', async ({ page, request }) => {
    const response = await page.goto('/profile/doc-pages-2')
    expect(response?.status()).toBe(200)
    // The HTML is fetched with `request` so a dev-server reload cannot discard it.
    const html = await (await request.get('/profile/doc-pages-2')).text()
    await expect(page.getByRole('heading', { name: 'plain-user' })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Generated avatar' })).toBeVisible()
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/api\/og\?variant=profile&address=0x5e00000000000000000000000000000000000002$/)
    expect(html).not.toContain('/media/doc-pages-2')
  })

  test('a switchboard outage is a 503, never a 404', async ({ request }) => {
    for (const path of ['/@outage-handle', '/profile/doc-pages-outage']) {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status(), path).toBe(503)
      expect(response.headers()['cache-control']).toMatch(/no-store|no-cache/)
    }
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

  test('ignores a ?v= cache-busting query', async ({ request }) => {
    const response = await request.get('/media/stub-avatar-doc/avatar?v=0123456789ab', { maxRedirects: 0 })
    expect(response.status()).toBe(302)
    expect(response.headers().location).toMatch(new RegExp(`^${STUB_SWITCHBOARD_URL}/__stub/s3/[0-9a-f]{64}$`))
    expect(response.headers()['cache-control']).toBe('public, max-age=60, stale-while-revalidate=240')
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

// Next/the router normalise dot segments before the handler runs (so these 404
// without its cache header); the handler's regex is defence in depth.
for (const path of ['/media/%2e%2e/avatar', '/media/%2e/avatar']) {
  test(`${path} is never proxied to the switchboard`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status()).toBe(404)
  })
}

test('/media passes a switchboard 5xx on as an uncached 502', async ({ request }) => {
  const response = await request.get('/media/stub-broken-doc/avatar', { maxRedirects: 0 })
  expect(response.status()).toBe(502)
  expect(response.headers()['cache-control']).toBe('no-store')
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

test('versioned media URLs follow the attachment hash; no avatar means no /media source', () => {
  const ref = `attachment://v1:${'ab12'.repeat(16)}`
  expect(mediaVersion(ref)).toBe('ab12ab12ab12')
  expect(mediaVersion('https://x.example/a.png')).toBeNull()
  expect(mediaVersion(null)).toBeNull()
  expect(mediaUrl('doc-1', 'avatar')).toBe('/media/doc-1/avatar')
  expect(mediaUrl('doc-1', 'avatar', 'https://r.id')).toBe('https://r.id/media/doc-1/avatar')
  expect(mediaUrl('doc-1', 'avatar', '', ref)).toBe('/media/doc-1/avatar?v=ab12ab12ab12')
  expect(avatarSources({ documentId: 'doc-1', avatar: ref, userImage: 'https://ens.example/a.png' })).toEqual([
    '/media/doc-1/avatar?v=ab12ab12ab12',
    'https://ens.example/a.png',
  ])
  expect(avatarSources({ documentId: 'doc-1', avatar: null, userImage: 'https://ens.example/a.png' })).toEqual([
    'https://ens.example/a.png',
  ])
  expect(avatarSources({ documentId: 'doc-1', avatar: null, userImage: null })).toEqual([])
  expect(avatarSources({ documentId: 'doc-1', avatar: ref, previewUrl: 'blob:x' })[0]).toBe('blob:x')
})

test('Escape cancels the crop dialog, except while the crop is being prepared', () => {
  expect(cancelsOnKey('Escape', false)).toBe(true)
  expect(cancelsOnKey('Escape', true)).toBe(false)
  expect(cancelsOnKey('Enter', false)).toBe(false)
})
