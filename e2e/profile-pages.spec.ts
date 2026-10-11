import { test, expect } from '@playwright/test'
import { identicon } from '../utils/identicon'
import { identityAccent } from '../lib/identity-art'
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
    const panel = page.getByRole('region', { name: 'Check this identity' })
    await expect(panel).toContainText(ADDRESS)
    await expect(panel).toContainText(`did:pkh:eip155:1:${ADDRESS}`)
    await expect(panel.getByRole('button', { name: 'Copy address' })).toBeVisible()
    await expect(panel.getByRole('link', { name: 'View on Etherscan' })).toHaveAttribute('href', `https://etherscan.io/address/${ADDRESS}`)
    await expect(page).toHaveTitle('Pat Pages (@pat-pages) on Renown')
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

test('the avatar ring takes the accent computed on the server; the art module never reaches the browser', async ({ page }) => {
  const scripts: string[] = []
  page.on('response', async (response) => {
    if (response.request().resourceType() === 'script') scripts.push(await response.text().catch(() => ''))
  })
  await page.goto('/@pat-pages')
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(identityAccent(ADDRESS).slice(i, i + 2), 16))
  await expect(page.locator('main header [style*="box-shadow"]').first()).toHaveCSS('box-shadow', `rgb(${r}, ${g}, ${b}) 0px 0px 0px 2px`)
  await page.waitForLoadState('networkidle')
  expect(scripts.length).toBeGreaterThan(0)
  expect(scripts.some((js) => js.includes('(pages-dir-browser)/./lib/identity-art.ts')), 'lib/identity-art.ts is in a browser chunk').toBe(false)
})

test.describe('phone bottom sheets', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  // A sheet is position: fixed; inside a backdrop-filtered/transformed ancestor it would be
  // positioned against that ancestor instead of the screen. It must sit 16 px above the bottom.
  for (const [button, region] of [
    ['Share', 'Share'],
    ['Verified Renown identity', 'Verified Renown identity'],
  ] as const) {
    test(`the ${button} sheet is pinned to the bottom of the screen`, async ({ page }) => {
      await page.goto('/@pat-pages')
      await page.getByRole('button', { name: button, exact: false }).first().click()
      const sheet = page.getByRole('region', { name: region }).first()
      await expect(sheet).toBeVisible()
      const box = (await sheet.boundingBox())!
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(Math.abs(box.y + box.height - (844 - 16))).toBeLessThan(2)
      expect(box.x).toBeGreaterThanOrEqual(15)
      expect(box.width).toBeGreaterThan(390 - 34)
    })
  }
})

test.describe('popover placement on wider screens', () => {
  // The Share panel opens below its button, or above it when only there it fits.
  // A viewport just too short for "below": the button's bottom + 8 px gap + the panel
  // height, minus 40 px. Measured first at a tall viewport, where it opens below.
  async function measure(page: import('@playwright/test').Page) {
    await page.setViewportSize({ width: 1280, height: 1200 })
    await page.goto('/@pat-pages')
    const button = page.getByRole('button', { name: 'Share', exact: true })
    await button.click()
    const panel = page.getByRole('region', { name: 'Share' })
    await expect(panel).toBeVisible()
    const b = (await button.boundingBox())!
    const p = (await panel.boundingBox())!
    expect(p.y).toBeGreaterThan(b.y + b.height) // below
    await button.click()
    await expect(panel).toHaveCount(0)
    return { button, panel, short: Math.round(b.y + b.height + 8 + p.height - 40) }
  }
  const isAbove = async (button: import('@playwright/test').Locator, panel: import('@playwright/test').Locator) => {
    const b = (await button.boundingBox())!
    const p = (await panel.boundingBox())!
    return p.y + p.height <= b.y
  }

  test('reopening with the toggle after the viewport grew opens below again', async ({ page }) => {
    const { button, panel, short } = await measure(page)
    await page.setViewportSize({ width: 1280, height: short })
    await button.click()
    expect(await isAbove(button, panel)).toBe(true)
    await button.click() // closed with the toggle
    await page.setViewportSize({ width: 1280, height: 1200 })
    await button.click()
    await expect(panel).toBeVisible()
    expect(await isAbove(button, panel)).toBe(false)
  })

  test('while open, a resize moves the panel to the side where it fits', async ({ page }) => {
    const { button, panel, short } = await measure(page)
    await button.click()
    expect(await isAbove(button, panel)).toBe(false)
    await page.setViewportSize({ width: 1280, height: short })
    await expect.poll(() => isAbove(button, panel)).toBe(true)
    await page.setViewportSize({ width: 1280, height: 1200 })
    await expect.poll(() => isAbove(button, panel)).toBe(false)
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

  test('a ?v= that does not name the stored image keeps the redirect (matching ones: e2e/media.spec.ts)', async ({ request }) => {
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
