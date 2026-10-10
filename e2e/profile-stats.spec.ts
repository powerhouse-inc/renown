import { test, expect } from '@playwright/test'
import { fixtureStub } from './support/stub-switchboard-client'

const MAKER = '0x5e00000000000000000000000000000000000e01'
const QUIET = '0x5e00000000000000000000000000000000000e02'
const BROKEN = '0x5e00000000000000000000000000000000000e03'
const ALPHA = 'did:key:z6MkAbcStatsAppForE2eTests1111111111111111111'
const BETA = 'did:key:z6MkBetaStatsAppForE2eTests111111111111111111'
const GAMMA = 'did:key:z6MkGammaStatsAppForE2eTests11111111111111111'
const SHA = 'a'.repeat(64)
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
const stat = (appDid: string, metric: string, value: number, extra: Record<string, unknown> = {}) => ({
  appDid,
  metric,
  value,
  updatedAt: '2026-10-09T00:00:00.000Z',
  appName: 'Alpha Notes',
  appDocumentId: 'stub-app-doc',
  appHasLogo: true,
  appLogoRef: `attachment://v1:${SHA}`,
  appLogo: null,
  label: null,
  unit: null,
  ...extra,
})

test.beforeAll(async () => {
  const users = (p: unknown) => ({ data: { renownUsers: [p] } })
  await fixtureStub({ match: 'renownUsers', variables: '"stats-maker"', response: users(profile('stats-maker', MAKER, 'Sam Stats')) })
  await fixtureStub({ match: 'renownUsers', variables: '"no-stats-maker"', response: users(profile('no-stats-maker', QUIET, 'Quinn Quiet')) })
  await fixtureStub({ match: 'renownUsers', variables: '"broken-stats-maker"', response: users(profile('broken-stats-maker', BROKEN, 'Bo Broken')) })
  await fixtureStub({ match: 'userStats(', variables: BROKEN, status: 500, response: { errors: [{ message: 'boom' }] } })
  await fixtureStub({
    match: 'userStats(',
    variables: MAKER,
    response: {
      data: {
        userStats: [
          stat(ALPHA, 'notes', 1234, { label: 'Notes written', unit: 'notes' }),
          stat(ALPHA, 'raw', 5),
          stat(BETA, 'streak', 7, { appName: 'Beta', appDocumentId: 'doc-beta', appHasLogo: false, appLogoRef: null, label: 'Best streak' }),
          stat(GAMMA, 'x', 1, { appName: null, appDocumentId: null, appHasLogo: false, appLogoRef: null }),
        ],
      },
    },
  })
})

test('a profile shows its stats grouped by app', async ({ page }) => {
  expect((await page.goto('/@stats-maker'))?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Alpha Notes/ })).toHaveAttribute('href', `/app/${ALPHA}`)
  await expect(page.locator('img[alt="Alpha Notes logo"]')).toHaveAttribute('src', `/media/stub-app-doc/logo?v=${SHA.slice(0, 12)}`)
  const notes = page.locator(`[data-app-did="${ALPHA}"] [data-metric="notes"]`)
  await expect(notes).toHaveAttribute('data-value', '1234')
  await expect(notes).toContainText('Notes written')
  await expect(notes).toContainText('1,234')
  await expect(notes).toContainText('notes')
  // Undeclared metrics (no label) are never shown.
  await expect(page.locator(`[data-app-did="${ALPHA}"] [data-metric="raw"]`)).toHaveCount(0)
  await expect(page.locator(`[data-app-did="${BETA}"] [data-metric="streak"]`)).toContainText('Best streak')
  await expect(page.getByRole('link', { name: /Beta/ })).toHaveAttribute('href', `/app/${BETA}`)
  await expect(page.locator(`[data-app-did="${GAMMA}"]`)).toHaveCount(0)
})

test('a profile without stats shows no stats section', async ({ page }) => {
  expect((await page.goto('/@no-stats-maker'))?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Quinn Quiet' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toHaveCount(0)
})

test('a failing stats read hides the section and the profile still renders', async ({ page }) => {
  expect((await page.goto('/@broken-stats-maker'))?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Bo Broken' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toHaveCount(0)
})
