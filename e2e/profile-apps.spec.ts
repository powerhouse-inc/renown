import { test, expect } from '@playwright/test'
import { fixtureStub } from './support/stub-switchboard-client'

const MAKER = '0x5e00000000000000000000000000000000000b01'
const NOBODY = '0x5e00000000000000000000000000000000000b02'
const profile = (handle: string, address: string, displayName: string) => ({
  documentId: `doc-${handle}`,
  username: handle,
  ethAddress: address,
  userImage: null,
  displayName,
  handle,
  bio: null,
  links: [],
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})
const app = (appDid: string, name: string, extra: Record<string, unknown> = {}) => ({
  appDid,
  documentId: `doc-${name}`,
  name,
  tagline: `${name} tagline`,
  logo: null,
  website: null,
  publisherDid: `did:pkh:eip155:1:${MAKER}`,
  description: null,
  category: null,
  logoRef: null,
  coverRef: null,
  links: [],
  ...extra,
})
const ALPHA = 'did:key:z6MkjchhfUsD6mmvni8mCdXHw216Xrm9bQe2mBH1P5RDjVJG'
const GAMMA = 'did:key:z6MkjchhfUsD6mmvni8mCdXHw216Xrm9bQe2mBH1P5RDjVJH'
const BETA = 'did:key:zDnaerDaTF5BXEavCrfRZEk316dpbLsfPDZ3WJ5hRTPFU2169'

test.beforeAll(async () => {
  const users = (p: unknown) => ({ data: { renownUsers: [p] } })
  await fixtureStub({ match: 'renownUsers', variables: '"app-maker"', response: users(profile('app-maker', MAKER, 'Ada Maker')) })
  await fixtureStub({ match: 'renownUsers', variables: '"no-apps-maker"', response: users(profile('no-apps-maker', NOBODY, 'Nia None')) })
  await fixtureStub({
    match: 'appProfile(',
    variables: GAMMA,
    response: { data: { appProfile: app(GAMMA, 'Alpha', { logoRef: `attachment://v1:${'3'.repeat(64)}`, coverRef: `attachment://v1:${'4'.repeat(64)}`, category: 'Tools' }) } },
  })
  await fixtureStub({
    match: 'appProfilesByPublisher(',
    variables: MAKER,
    response: {
      data: {
        appProfilesByPublisher: [
          app(ALPHA, 'Alpha', { logoRef: `attachment://v1:${'3'.repeat(64)}`, category: 'Tools' }),
          app(BETA, 'Beta', { logo: 'https://cdn.example/beta.png' }),
        ],
      },
    },
  })
})

test('a publisher profile lists its apps and counts them', async ({ page }) => {
  expect((await page.goto('/@app-maker'))?.status()).toBe(200)
  await expect(page.getByText('2 apps published')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Apps published' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Alpha/ })).toHaveAttribute('href', `/app/${ALPHA}`)
  await expect(page.getByRole('link', { name: /Beta/ })).toHaveAttribute('href', `/app/${BETA}`)
  // The server-rendered markup carries the versioned media URLs (the browser then drops images that fail to load).
  const html = await (await page.request.get('/@app-maker')).text()
  expect(html).toContain(`src="/media/doc-Alpha/logo?v=${'3'.repeat(12)}"`)
  expect(html).toContain('src="https://cdn.example/beta.png"')
  await expect(page.getByText('Tools', { exact: true })).toBeVisible()
})

test('a profile without apps shows neither', async ({ page }) => {
  expect((await page.goto('/@no-apps-maker'))?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Nia None' })).toBeVisible()
  await expect(page.getByText(/apps? published/)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Apps published' })).toHaveCount(0)
})

test('a logo that 404s falls back to the monogram on the card and the app page', async ({ page }) => {
  // doc-Alpha has no media on the stub: /media/doc-Alpha/logo is a 404.
  await page.goto('/@app-maker')
  await expect(page.getByRole('link', { name: /Alpha/ })).toBeVisible()
  await expect(page.locator('img[alt="Alpha logo"]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Alpha/ }).getByText('A', { exact: true })).toBeVisible()

  await page.goto(`/app/${GAMMA}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha' })).toBeVisible()
  await expect(page.locator('img[alt="Alpha logo"]')).toHaveCount(0)
  await expect(page.locator('main header').getByText('A', { exact: true })).toBeVisible()
  // No logo and no cover image: the cover is identity art (inline SVG), the logo its monogram.
  await expect(page.locator('main header img')).toHaveCount(0)
  await expect(page.locator('main header .rn-art svg')).toHaveCount(2)
})
