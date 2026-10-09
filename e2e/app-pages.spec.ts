import { test, expect } from '@playwright/test'
import { fixtureStub } from './support/stub-switchboard-client'

// The public app page, server-rendered against the stub switchboard. Fixtures
// use ids no other spec uses (they survive renown-writes.spec.ts's resets).
const APP_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
const PUBLISHER = '0x5e00000000000000000000000000000000000a01'
const APP = {
  appDid: APP_DID,
  documentId: 'stub-app-doc',
  name: 'Vault Pages',
  tagline: 'Notes for teams',
  logo: null,
  website: 'https://vault.example',
  publisherDid: `did:pkh:eip155:1:${PUBLISHER}`,
  description: '## About\n\nKeeps **notes** in sync.\n\n- [Docs](https://docs.vault.example)\n- [Evil](javascript:alert(1))\n\n<script>alert(1)</script>',
  category: 'Productivity',
  logoRef: `attachment://v1:${'1'.repeat(64)}`,
  coverRef: `attachment://v1:${'2'.repeat(64)}`,
  links: [
    { id: 'l1', label: 'GitHub', url: 'https://github.com/acme/vault' },
    { id: 'l2', label: 'Bad', url: 'javascript:alert(1)' },
  ],
}
const PUBLISHER_PROFILE = {
  documentId: 'doc-app-publisher',
  username: 'vault-maker',
  ethAddress: PUBLISHER,
  userImage: null,
  displayName: 'Vera Vault',
  handle: 'vera-vault',
  bio: null,
  links: [],
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const OUTAGE_DID = 'did:key:z6MknGc3ocHs3zdPiJbnaaqDi58NGb4pk1Sp9WNzAx1WSpcT'
const MINIMAL_DID = 'did:key:z6MkjchhfUsD6mmvni8mCdXHw216Xrm9bQe2mBH1P5RDjVJG'

test.beforeAll(async () => {
  await fixtureStub({ match: 'appProfile(', variables: OUTAGE_DID, status: 500, response: { error: 'boom' } })
  await fixtureStub({
    match: 'appProfile(',
    variables: MINIMAL_DID,
    response: { data: { appProfile: { appDid: MINIMAL_DID, documentId: 'stub-app-min', name: 'Tiny', tagline: null, logo: null, website: null, publisherDid: null, description: null, category: null, logoRef: null, coverRef: null, links: [] } } },
  })
  await fixtureStub({ match: 'appProfile(', variables: APP_DID, response: { data: { appProfile: APP } } })
  await fixtureStub({ match: 'renownUsers', variables: PUBLISHER, response: { data: { renownUsers: [PUBLISHER_PROFILE] } } })
})

test.describe('app page', () => {
  test('renders the profile, safe links only, and link-preview meta', async ({ page }) => {
    const response = await page.goto(`/app/${APP_DID}`)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Vault Pages' })).toBeVisible()
    await expect(page.getByText('Notes for teams')).toBeVisible()
    await expect(page.getByText('Productivity', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible()
    await expect(page.locator('strong', { hasText: 'notes' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', 'https://docs.vault.example/')
    await expect(page.getByRole('link', { name: 'Evil' })).toHaveCount(0)
    const docs = page.getByRole('link', { name: 'Docs' })
    await expect(docs).toHaveAttribute('target', '_blank')
    await expect(docs).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc')
    await expect(page.locator('main script')).toHaveCount(0)
    await expect(page.getByText('<script>alert(1)</script>')).toBeVisible()
    await expect(page.getByRole('link', { name: /GitHub/ })).toHaveAttribute('href', 'https://github.com/acme/vault')
    await expect(page.getByRole('link', { name: /Bad/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /vault\.example/ })).toHaveAttribute('href', 'https://vault.example')
    await expect(page.locator('img[alt="Vault Pages logo"]')).toHaveAttribute('src', '/media/stub-app-doc/logo?v=111111111111')
    await expect(page.locator('img[src="/media/stub-app-doc/cover?v=222222222222"]')).toHaveCount(1)
    await expect(page.getByRole('link', { name: /Vera Vault/ })).toHaveAttribute('href', '/@vera-vault')
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Vault Pages — Notes for teams')
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/media\/stub-app-doc\/cover\?v=222222222222$/)
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/app/${APP_DID}$`))
  })

  test('an unknown or malformed app DID is a 404 page', async ({ page }) => {
    for (const path of ['/app/did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH', '/app/not-a-did']) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(404)
      await expect(page.getByRole('heading', { name: 'App not found' })).toBeVisible()
    }
  })

  test('a switchboard outage is a 503, never a 404', async ({ request }) => {
    const response = await request.get(`/app/${OUTAGE_DID}`, { maxRedirects: 0 })
    expect(response.status()).toBe(503)
    expect(response.headers()['cache-control']).toMatch(/no-store|no-cache/)
    expect(response.headers()['retry-after']).toBe('30')
  })

  test('/media serves app logos and covers', async ({ request }) => {
    for (const field of ['logo', 'cover']) {
      const response = await request.get(`/media/stub-app-doc/${field}`, { maxRedirects: 0 })
      expect(response.status(), field).toBe(302)
    }
  })
})
