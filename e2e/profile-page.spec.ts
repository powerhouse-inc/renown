import { test, expect, type Page } from '@playwright/test'
import { attachScreenshots, expectNoSeriousA11yViolations, layoutShift, useTheme } from './support/site'
import { fixtureStub } from './support/stub-switchboard-client'

// The redesigned public profile (/@handle): hero, share, verification, owner
// view, sections and SEO. Fixture ids are unique to this spec.
const RICH = '0x5e00000000000000000000000000000000000f11'
const MINIMAL = '0x5e00000000000000000000000000000000000f12'
const LONG = '0x5e00000000000000000000000000000000000f13'
const UNSAFE = '0x5e00000000000000000000000000000000000f14'
const APP_DID = 'did:key:z6MkRuthNotesAppxxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
const LONG_WORD = 'W'.repeat(120)
const profile = (handle: string, address: string, extra: Record<string, unknown> = {}) => ({
  documentId: `doc-${handle}`,
  username: null,
  ethAddress: address,
  userImage: null,
  displayName: null,
  handle,
  bio: null,
  links: [],
  avatar: null,
  createdAt: '2026-06-15T16:49:47.419Z',
  updatedAt: '2026-10-09T10:00:00.000Z',
  ...extra,
})
const RICH_PROFILE = profile('rich-ruth', RICH, {
  displayName: 'Ruth Rich',
  bio: 'Builds **tools** for open organisations. Read [my notes](https://notes.example).\n\nSecond paragraph.',
  links: [
    { id: 'l1', label: 'GitHub', url: 'https://github.com/ruth' },
    { id: 'l2', label: 'Blog', url: 'https://ruth.example/blog' },
    { id: 'l3', label: 'Evil', url: 'javascript:alert(1)' },
  ],
})

test.beforeAll(async () => {
  const users = (p: unknown) => ({ data: { renownUsers: [p] } })
  await fixtureStub({ match: 'renownUsers', variables: '"rich-ruth"', response: users(RICH_PROFILE) })
  await fixtureStub({ match: 'renownUsers', variables: '"min-mo"', response: users(profile('min-mo', MINIMAL, { username: '0x5E00...0f12' })) })
  await fixtureStub({
    match: 'renownUsers',
    variables: '"unsafe-una"',
    response: users(profile('unsafe-una', UNSAFE, { links: [{ id: 'u1', label: 'Script', url: 'javascript:alert(1)' }] })),
  })
  await fixtureStub({
    match: 'renownUsers',
    variables: '"long-lars"',
    response: users(profile('long-lars', LONG, { displayName: LONG_WORD, bio: `${LONG_WORD} ${'word '.repeat(300)}` })),
  })
  await fixtureStub({
    match: 'appProfilesByPublisher(',
    variables: RICH,
    response: {
      data: {
        appProfilesByPublisher: [
          { appDid: APP_DID, documentId: 'doc-pp-app', name: 'Ruth Notes', tagline: 'Notes for Ruth', logo: null, website: null, publisherDid: `did:pkh:eip155:1:${RICH}`, description: null, category: 'Data', logoRef: null, coverRef: null, links: [] },
        ],
      },
    },
  })
  await fixtureStub({
    match: 'userStats(',
    variables: RICH,
    response: {
      data: {
        userStats: [
          { appDid: APP_DID, metric: 'notes', value: 1284, updatedAt: '2026-10-09T00:00:00.000Z', appName: 'Ruth Notes', appDocumentId: 'doc-pp-app', appHasLogo: false, appLogoRef: null, appLogo: null, label: 'Notes written', unit: 'notes' },
        ],
      },
    },
  })
})

async function signedInAs(page: Page, address: string | null) {
  await page.addInitScript((viewer) => {
    if (viewer) (window as { __renownE2eViewer?: string }).__renownE2eViewer = viewer
  }, address)
}

test.describe('profile page', () => {
  test('a rich profile shows identity, facts, about, apps and activity', async ({ page }) => {
    expect((await page.goto('/@rich-ruth'))?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Ruth Rich' })).toBeVisible()
    await expect(page.getByText('@rich-ruth', { exact: true })).toBeVisible()
    const facts = page.getByRole('list', { name: 'About this profile' })
    await expect(facts).toContainText('Member since June 2026')
    await expect(facts).toContainText('1 app published')
    await expect(facts).toContainText('Active in 1 app')
    await expect(page.getByRole('heading', { level: 2, name: 'About' })).toBeVisible()
    await expect(page.locator('strong', { hasText: 'tools' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'my notes' })).toHaveAttribute('href', 'https://notes.example/')
    const links = page.getByRole('list', { name: 'Links' })
    await expect(links.getByRole('link', { name: /GitHub/ })).toHaveAttribute('href', 'https://github.com/ruth')
    await expect(links.getByRole('link', { name: /GitHub/ })).toContainText('github.com')
    await expect(links.getByRole('link', { name: /Blog/ })).toContainText('ruth.example')
    await expect(page.getByRole('link', { name: /Evil/ })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 2, name: 'Apps published' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Ruth Notes/ }).first()).toHaveAttribute('href', `/app/${APP_DID}`)
    await expect(page.getByRole('heading', { level: 2, name: 'Activity' })).toBeVisible()
    await expect(page.locator(`[data-app-did="${APP_DID}"] [data-metric="notes"]`)).toContainText('1,284')
    await expect(page.getByText('Nothing public yet')).toHaveCount(0)
  })

  test('a minimal profile names itself by handle and says what will appear, never an empty frame', async ({ page }) => {
    expect((await page.goto('/@min-mo'))?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'min-mo' })).toBeVisible()
    await expect(page.getByText('Nothing public yet')).toBeVisible()
    await expect(page.getByRole('list', { name: 'About this profile' })).toHaveText(/Member since June 2026/)
    await expect(page.getByText(/apps? published/)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'About', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Activity' })).toHaveCount(0)
  })

  test('a profile whose only link is not http(s) counts as empty: no About heading', async ({ page }) => {
    expect((await page.goto('/@unsafe-una'))?.status()).toBe(200)
    await expect(page.getByText('Nothing public yet')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'About', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Script/ })).toHaveCount(0)
  })

  test('the verified badge explains what is verified and links to /trust', async ({ page }) => {
    await page.goto('/@rich-ruth')
    const badge = page.getByRole('button', { name: 'Verified Renown identity' })
    await expect(badge).toHaveAttribute('aria-expanded', 'false')
    await badge.click()
    await expect(badge).toHaveAttribute('aria-expanded', 'true')
    const panel = page.getByRole('region', { name: 'Verified Renown identity' })
    await expect(panel).toContainText('0x5e00…0f11 controls this identity')
    await expect(panel.getByRole('link', { name: 'How Renown verifies identities' })).toHaveAttribute('href', '/trust')
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(badge).toBeFocused()
  })

  test('Share copies the canonical link (announced) and shows its QR code', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/@rich-ruth')
    await page.getByRole('button', { name: 'Share' }).click()
    const menu = page.getByRole('region', { name: 'Share' })
    await expect(menu.getByRole('img', { name: /^QR code for http:\/\/localhost:\d+\/@rich-ruth$/ })).toBeVisible()
    await menu.getByRole('button', { name: 'Copy link' }).click()
    await expect(menu.getByRole('status')).toHaveText('Link copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/@rich-ruth$/)
    await page.mouse.click(5, 5)
    await expect(menu).toHaveCount(0)
  })

  test('on a 1280 x 900 screen the whole Share panel, QR code included, is on screen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/@rich-ruth')
    await page.getByRole('button', { name: 'Share' }).click()
    const menu = page.getByRole('region', { name: 'Share' })
    const header = await page.locator('body header').first().boundingBox()
    for (const part of [menu, menu.getByRole('img', { name: /^QR code for / }), menu.getByText('Scan to open this profile')]) {
      const box = await part.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.y).toBeGreaterThanOrEqual(header!.y + header!.height)
      expect(box!.y + box!.height).toBeLessThanOrEqual(900)
    }
  })

  test('the owner sees Edit profile and how complete the profile is; visitors never do', async ({ page }) => {
    await page.goto('/@min-mo')
    await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit profile' })).toHaveCount(0)

    await signedInAs(page, MINIMAL.toUpperCase().replace('0X', '0x'))
    await page.goto('/@min-mo')
    await expect(page.getByRole('main').getByRole('link', { name: 'Edit profile' })).toHaveAttribute('href', '/profile/edit')
    // min-mo has a handle only: 1 of 4 (avatar, bio and a link are missing).
    await expect(page.getByRole('main').getByRole('link', { name: /1 of 4 profile steps done/ })).toHaveAttribute('href', '/profile/edit')

    await signedInAs(page, RICH)
    await page.goto('/@min-mo')
    await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: 'Edit profile' })).toHaveCount(0)
  })

  test('JSON-LD is valid and describes the person', async ({ request }) => {
    const html = await (await request.get('/@rich-ruth')).text()
    const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>)
    const page = blocks.find((b) => b['@type'] === 'ProfilePage') as { mainEntity: Record<string, unknown>; url: string }
    expect(page.url).toMatch(/\/@rich-ruth$/)
    expect(page.mainEntity).toMatchObject({
      '@type': 'Person',
      name: 'Ruth Rich',
      alternateName: '@rich-ruth',
      identifier: `did:pkh:eip155:1:${RICH}`,
      sameAs: ['https://github.com/ruth', 'https://ruth.example/blog'],
    })
  })

  test('a 120-character name without spaces and a very long bio stay inside the page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    expect((await page.goto('/@long-lars'))?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })

  test('nothing shifts after load, for visitors and owners', async ({ page }) => {
    await page.goto('/@rich-ruth')
    expect(await layoutShift(page)).toBeLessThan(0.01)
    await signedInAs(page, RICH)
    await page.goto('/@rich-ruth')
    await expect(page.getByRole('main').getByRole('link', { name: 'Edit profile' })).toBeVisible()
    expect(await layoutShift(page)).toBeLessThan(0.01)
  })
})

for (const theme of ['light', 'dark'] as const) {
  for (const [label, path] of [
    ['rich', '/@rich-ruth'],
    ['minimal', '/@min-mo'],
  ] as const) {
    test(`a ${label} profile has no serious axe violations (${theme})`, async ({ page }, testInfo) => {
      await useTheme(page, theme)
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expectNoSeriousA11yViolations(page)
      await page.getByRole('button', { name: 'Share' }).click()
      await expectNoSeriousA11yViolations(page)
      await attachScreenshots(page, testInfo, `profile-${label}-${theme}`)
    })
  }
}
