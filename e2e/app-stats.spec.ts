import { test, expect } from '@playwright/test'
import { fixtureStub } from './support/stub-switchboard-client'

// The app page's stats section, server-rendered against the stub switchboard.
// Ids no other spec uses (fixtures survive renown-writes.spec.ts's resets).
const APP_DID = 'did:key:z6MkStatsAppDidForE2eTests1111111111111111111'
const FAIL_DID = 'did:key:z6MkBrokenStatsDidForE2eTests1111111111111111111'
const QUIET_DID = 'did:key:z6MkQuietAppDidForE2eTests1111111111111111111'
const ADA = '0x5e00000000000000000000000000000000000d01'
const BEN = '0x5e00000000000000000000000000000000000d02'
const KEY_USER = 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH'
const app = (appDid: string, name: string) => ({
  appDid,
  documentId: `doc-${name}`,
  name,
  tagline: null,
  logo: null,
  website: null,
  publisherDid: null,
  description: null,
  category: null,
  logoRef: null,
  coverRef: null,
  links: [],
})
const contributor = (userDid: string, value: number, extra: Record<string, unknown> = {}) => ({
  userDid,
  value,
  address: null,
  handle: null,
  displayName: null,
  documentId: null,
  hasAvatar: false,
  avatar: null,
  userImage: null,
  ...extra,
})
const STATS = {
  appDid: APP_DID,
  activeUsers30d: 5,
  totalUsers: 12,
  updatedAt: '2026-10-09T08:00:00.000Z',
  metrics: [
    {
      key: 'notes',
      label: 'Notes written',
      unit: 'notes',
      description: 'Notes across all vaults',
      aggregation: 'SUM',
      value: 1234,
      users: 9,
      top: [
        contributor(`did:pkh:eip155:1:${ADA}`, 900, {
          address: ADA,
          handle: 'ada',
          displayName: 'Ada',
          documentId: 'stub-avatar-doc',
          hasAvatar: true,
          avatar: `attachment://v1:${'ab12'.repeat(16)}`,
        }),
        contributor(`did:pkh:eip155:1:${BEN}`, 300, { address: BEN }),
        contributor(KEY_USER, 34, { userImage: 'https://example.com/key-user.png' }),
      ],
    },
    { key: 'streak.days', label: 'Best streak', unit: null, description: null, aggregation: 'MAX', value: 42, users: 3, top: [] },
  ],
}

test.beforeAll(async () => {
  await fixtureStub({ match: 'appProfile(', variables: APP_DID, response: { data: { appProfile: app(APP_DID, 'Stats Vault') } } })
  await fixtureStub({ match: 'appStats(', variables: APP_DID, response: { data: { appStats: STATS } } })
  await fixtureStub({ match: 'appProfile(', variables: QUIET_DID, response: { data: { appProfile: app(QUIET_DID, 'Quiet') } } })
  await fixtureStub({ match: 'appProfile(', variables: FAIL_DID, response: { data: { appProfile: app(FAIL_DID, 'Failing') } } })
  await fixtureStub({ match: 'appStats(', variables: FAIL_DID, status: 500, response: { errors: [{ message: 'boom' }] } })
})

test.describe('app page stats', () => {
  test('shows tiles, active users and top contributors', async ({ page }) => {
    expect((await page.goto(`/app/${APP_DID}`))?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Stats', exact: true })).toBeVisible()
    await expect(page.getByText('Updated 9 Oct 2026')).toBeVisible()

    const notes = page.locator('[data-metric="notes"]')
    await expect(notes).toHaveAttribute('data-value', '1234')
    await expect(notes).toContainText('1,234')
    await expect(notes).toContainText('notes')
    await expect(notes).toContainText('Notes written')
    await expect(notes).toContainText('Total')
    await expect(page.locator('[data-metric="streak.days"]')).toContainText('42')
    await expect(page.locator('[data-metric="streak.days"]')).toContainText('Highest')
    await expect(page.getByText('of 12 users')).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Top contributors' })).toBeVisible()
    const ada = page.getByRole('link', { name: /Ada/ })
    await expect(ada).toHaveAttribute('href', '/@ada')
    await expect(ada).toContainText('900 notes')
    await expect(ada.locator('img')).toHaveAttribute('src', '/media/stub-avatar-doc/avatar?v=ab12ab12ab12')
    await expect(page.getByRole('link', { name: /0x5e00…0d02/ })).toHaveAttribute('href', `/profile/${BEN}`)
    await expect(page.getByText('34 notes')).toBeVisible()
  })

  test('an app without stats shows no stats section', async ({ page }) => {
    expect((await page.goto(`/app/${QUIET_DID}`))?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Quiet' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Stats', exact: true })).toHaveCount(0)
  })

  test('a contributor without an uploaded avatar requests no /media image', async ({ page }) => {
    const media: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/avatar')) media.push(r.url())
    })
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    await page.route('https://example.com/**', (route) => route.fulfill({ contentType: 'image/png', body: PNG }))
    await page.goto(`/app/${APP_DID}`)
    const key = page.getByText('34 notes').locator('xpath=ancestor::li')
    await expect(key.locator('img')).toHaveAttribute('src', 'https://example.com/key-user.png')
    const ben = page.getByRole('link', { name: /0x5e00…0d02/ })
    await expect(ben.locator('img')).toHaveCount(0)
    expect(media.every((u) => u.includes('stub-avatar-doc'))).toBe(true)
  })

  test('a failing stats read hides the section but keeps the page', async ({ page }) => {
    expect((await page.goto(`/app/${FAIL_DID}`))?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Failing' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Stats', exact: true })).toHaveCount(0)
  })
})
