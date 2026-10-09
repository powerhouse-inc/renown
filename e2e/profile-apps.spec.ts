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
const BETA = 'did:key:zDnaerDaTF5BXEavCrfRZEk316dpbLsfPDZ3WJ5hRTPFU2169'

test.beforeAll(async () => {
  const users = (p: unknown) => ({ data: { renownUsers: [p] } })
  await fixtureStub({ match: 'renownUsers', variables: '"app-maker"', response: users(profile('app-maker', MAKER, 'Ada Maker')) })
  await fixtureStub({ match: 'renownUsers', variables: '"no-apps-maker"', response: users(profile('no-apps-maker', NOBODY, 'Nia None')) })
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

test('a publisher profile lists its apps and shows the Publisher badge', async ({ page }) => {
  expect((await page.goto('/@app-maker'))?.status()).toBe(200)
  await expect(page.getByText('Publisher', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Apps published' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Alpha/ })).toHaveAttribute('href', `/app/${ALPHA}`)
  await expect(page.getByRole('link', { name: /Beta/ })).toHaveAttribute('href', `/app/${BETA}`)
  await expect(page.locator('img[alt="Alpha logo"]')).toHaveAttribute('src', `/media/doc-Alpha/logo?v=${'3'.repeat(12)}`)
  await expect(page.locator('img[alt="Beta logo"]')).toHaveAttribute('src', 'https://cdn.example/beta.png')
  await expect(page.getByText('Tools', { exact: true })).toBeVisible()
})

test('a profile without apps shows neither', async ({ page }) => {
  expect((await page.goto('/@no-apps-maker'))?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Nia None' })).toBeVisible()
  await expect(page.getByText('Publisher', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Apps published' })).toHaveCount(0)
})
