import { test, expect } from '@playwright/test'
import { attachScreenshots, expectNoSeriousA11yViolations, layoutShift, useTheme } from './support/site'
import { fixtureStub } from './support/stub-switchboard-client'
import { HERO_ART, identityArtSvgs, PUBLISHER_ART } from '../lib/identity-art'

// The redesigned app page (/app/[did]): cover or identity art, verification,
// stats zero state, publisher, more apps, SEO. Fixture ids are unique to this spec.
const PUBLISHER = '0x5e00000000000000000000000000000000000f21'
const COVERED = 'did:key:z6MkAppPageCoveredxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
const PLAIN = 'did:key:z6MkAppPageBareAppxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
const SIBLING = 'did:key:z6MkAppPageSisterAppxxxxxxxxxxxxxxxxxxxxxxxxx1'
const NEIGHBOUR = 'did:key:z6MkAppPageNeighbourxxxxxxxxxxxxxxxxxxxxxxxxx1'
const LONELY = 'did:key:z6MkAppPageSoAppxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
const UNSAFE_LINKS = 'did:key:z6MkAppPageUnsafeLinksxxxxxxxxxxxxxxxxxxxx1'
const MARKDOWN = 'did:key:z6MkAppPageMarkdownxxxxxxxxxxxxxxxxxxxxxxx1'
const app = (appDid: string, name: string, extra: Record<string, unknown> = {}) => ({
  appDid,
  documentId: `doc-ap-${name.replace(/\W/g, '')}`,
  name,
  tagline: `${name} tagline`,
  logo: null,
  website: null,
  publisherDid: `did:pkh:eip155:1:${PUBLISHER}`,
  description: null,
  category: 'Ledgers',
  logoRef: null,
  coverRef: null,
  links: [],
  ...extra,
})
const COVERED_APP = app(COVERED, 'Covered Ledger', {
  // stub-app-doc has a logo and a cover on the stub's /media route.
  documentId: 'stub-app-doc',
  logoRef: `attachment://v1:${'1'.repeat(64)}`,
  coverRef: `attachment://v1:${'2'.repeat(64)}`,
  website: 'https://ledger.example',
  links: [{ id: 'd', label: 'Discord', url: 'https://discord.gg/ledger' }],
})
const PLAIN_APP = app(PLAIN, 'Plain Ledger', { description: 'Plain words.' })

test.beforeAll(async () => {
  await fixtureStub({ match: 'appProfile(', variables: COVERED, response: { data: { appProfile: COVERED_APP } } })
  await fixtureStub({ match: 'appProfile(', variables: PLAIN, response: { data: { appProfile: PLAIN_APP } } })
  await fixtureStub({
    match: 'appProfile(',
    variables: UNSAFE_LINKS,
    response: {
      data: {
        appProfile: app(UNSAFE_LINKS, 'Unsafe Links', {
          publisherDid: null,
          category: null,
          links: [
            { id: 'j', label: 'Script', url: 'javascript:alert(1)' },
            { id: 'f', label: 'Files', url: 'ftp://files.example/app' },
          ],
        }),
      },
    },
  })
  await fixtureStub({
    match: 'appProfile(',
    variables: MARKDOWN,
    response: {
      data: {
        appProfile: app(MARKDOWN, 'Markdown Notes', {
          publisherDid: null,
          category: null,
          tagline: null,
          description: '# Big **news**\n\nRead [the docs](https://docs.example) and `ship` it.\n\n- fast\n- _calm_',
        }),
      },
    },
  })
  await fixtureStub({ match: 'appProfile(', variables: LONELY, response: { data: { appProfile: app(LONELY, 'Lonely', { publisherDid: null, category: null }) } } })
  await fixtureStub({
    match: 'renownUsers',
    variables: PUBLISHER,
    response: { data: { renownUsers: [{ documentId: 'doc-ap-pub', username: null, ethAddress: PUBLISHER, userImage: null, displayName: 'Pia Publisher', handle: 'pia-pub', bio: null, links: [], avatar: null, createdAt: null, updatedAt: null }] } },
  })
  await fixtureStub({
    match: 'appProfilesByPublisher(',
    variables: PUBLISHER,
    response: { data: { appProfilesByPublisher: [COVERED_APP, PLAIN_APP, app(SIBLING, 'Sibling Sheet', { category: 'Sheets' })] } },
  })
  await fixtureStub({
    match: 'appProfiles(',
    variables: '"Ledgers"',
    response: { data: { appProfiles: { items: [COVERED_APP, PLAIN_APP, app(NEIGHBOUR, 'Neighbour Books', { publisherDid: null })], next: null } } },
  })
  await fixtureStub({
    match: 'appStats(',
    variables: PLAIN,
    response: { data: { appStats: { appDid: PLAIN, activeUsers30d: 0, totalUsers: 0, updatedAt: null, metrics: [{ key: 'entries', label: 'Entries booked', unit: null, description: null, aggregation: 'SUM', value: 0, users: 0, top: [] }] } } },
  })
  await fixtureStub({ match: 'appStats(', variables: COVERED, status: 500, response: { errors: [{ message: 'boom' }] } })
})

test.describe('app page', () => {
  test('an app with a cover shows it over its identity art, with Open app and the category link', async ({ page }) => {
    expect((await page.goto(`/app/${COVERED}`))?.status()).toBe(200)
    const header = page.locator('main header')
    await expect(header.locator('img[src="/media/stub-app-doc/cover?v=222222222222"]')).toHaveCount(1)
    await expect(header.locator('.rn-art svg')).toHaveCount(2)
    await expect(page.getByRole('heading', { level: 1, name: 'Covered Ledger' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open app' })).toHaveAttribute('href', 'https://ledger.example')
    await expect(page.getByRole('main').getByRole('link', { name: 'Ledgers', exact: true })).toHaveAttribute('href', '/apps?category=Ledgers')
    await expect(page.getByRole('list', { name: 'Links' }).getByRole('link', { name: /Discord/ })).toContainText('discord.gg')
    // A failed stats read drops the section; the page stays.
    await expect(page.getByRole('heading', { name: 'Stats', exact: true })).toHaveCount(0)
  })

  test('an app without a cover shows its identity art, and a zero-stats app says no activity yet', async ({ page }) => {
    expect((await page.goto(`/app/${PLAIN}`))?.status()).toBe(200)
    const header = page.locator('main header')
    await expect(header.locator('img')).toHaveCount(0)
    await expect(header.locator('.rn-art svg')).toHaveCount(2)
    await expect(page.getByRole('link', { name: 'Open app' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Stats', exact: true })).toBeVisible()
    await expect(page.getByText('No activity reported yet')).toBeVisible()
    await expect(page.getByText(/starting with Entries booked/)).toBeVisible()
    await expect(page.locator('[data-metric="entries"]')).toHaveCount(0)
  })

  test('publisher, more apps by the publisher and more in the category', async ({ page }) => {
    await page.goto(`/app/${PLAIN}`)
    const publisher = page.getByRole('region', { name: 'Publisher', exact: true })
    await expect(publisher.getByRole('link', { name: /Pia Publisher/ })).toHaveAttribute('href', '/@pia-pub')
    await expect(publisher).toContainText('@pia-pub')
    const more = page.getByRole('region', { name: 'More apps by Pia Publisher' })
    await expect(more.getByRole('link')).toHaveCount(2)
    await expect(more.getByRole('link', { name: /Covered Ledger/ })).toHaveAttribute('href', `/app/${COVERED}`)
    await expect(more.getByRole('link', { name: /Sibling Sheet/ })).toHaveAttribute('href', `/app/${SIBLING}`)
    const category = page.getByRole('region', { name: 'More in Ledgers' })
    await expect(category.getByRole('link')).toHaveCount(2)
    await expect(category.getByRole('link', { name: /Neighbour Books/ })).toHaveAttribute('href', `/app/${NEIGHBOUR}`)
    await expect(category.getByRole('link', { name: /Plain Ledger/ })).toHaveCount(0)
  })

  test('an app without publisher or category shows neither section', async ({ page }) => {
    expect((await page.goto(`/app/${LONELY}`))?.status()).toBe(200)
    await expect(page.getByRole('region', { name: 'Publisher', exact: true })).toHaveCount(0)
    await expect(page.getByRole('region', { name: /^More / })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Check this app' })).toContainText(LONELY)
  })

  test('the verified badge explains the app identity and links to /developers', async ({ page }) => {
    await page.goto(`/app/${PLAIN}`)
    await page.getByRole('button', { name: 'Verified app identity' }).click()
    const panel = page.getByRole('region', { name: 'Verified app identity' })
    await expect(panel).toContainText('Only the holder of that key can sign as this app.')
    // The credential a sign-in creates names the app's key on the user's device, not the app DID (/trust "app-keys").
    await expect(panel).toContainText('your wallet signs a credential naming a key the app creates on your device')
    await expect(panel).not.toContainText('naming that key')
    await expect(panel.getByRole('link', { name: 'How apps prove who they are' })).toHaveAttribute('href', '/developers')
  })

  test('JSON-LD describes the software application and its publisher', async ({ request }) => {
    const html = await (await request.get(`/app/${COVERED}`)).text()
    const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>)
    expect(blocks.find((b) => b['@type'] === 'SoftwareApplication')).toMatchObject({
      name: 'Covered Ledger',
      identifier: COVERED,
      applicationCategory: 'Ledgers',
      installUrl: 'https://ledger.example',
      sameAs: ['https://discord.gg/ledger'],
      publisher: { '@type': 'Person', name: 'Pia Publisher' },
    })
  })

  test('at desktop width a short app keeps both columns balanced, related apps in the main column', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/app/${COVERED}`)
    await expect(page.locator('[data-layout="split"]')).toHaveCount(1)
    const main = page.locator('[data-column="main"]')
    await expect(main.getByRole('region', { name: 'More in Ledgers' })).toBeVisible()
    await expect(main.getByRole('heading', { name: 'Links', exact: true })).toBeVisible()
    const mainBox = await main.boundingBox()
    const asideBox = await page.locator('[data-column="aside"]').boundingBox()
    expect(mainBox && asideBox && mainBox.height / asideBox.height).toBeGreaterThan(0.6)
  })

  test('an app with nothing for a main column renders one column', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/app/${LONELY}`)
    await expect(page.locator('[data-layout="single"]')).toHaveCount(1)
    await expect(page.locator('[data-column="aside"]')).toHaveCount(0)
    const panel = await page.getByRole('region', { name: 'Check this app' }).boundingBox()
    expect(panel?.width).toBeLessThanOrEqual(560)
  })

  test('an app whose only links are not http(s) has no Links section and renders one column', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    expect((await page.goto(`/app/${UNSAFE_LINKS}`))?.status()).toBe(200)
    await expect(page.locator('[data-layout="single"]')).toHaveCount(1)
    await expect(page.locator('[data-layout="split"]')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Links', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Script|Files/ })).toHaveCount(0)
  })

  test('the meta and JSON-LD descriptions are plain text: no markdown syntax', async ({ request }) => {
    const html = await (await request.get(`/app/${MARKDOWN}`)).text()
    const expected = 'Big news. Read the docs and ship it. fast. calm'
    expect(/<meta name="description" content="([^"]*)"/.exec(html)?.[1]).toBe(expected)
    const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>)
    expect(blocks.find((b) => b['@type'] === 'SoftwareApplication')?.description).toBe(expected)
  })

  test('the hero and publisher art are computed on the server and passed as props', async ({ request }) => {
    const html = await (await request.get(`/app/${PLAIN}`)).text()
    const data = JSON.parse(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/.exec(html)![1]) as { props: { pageProps: { art: unknown; publisherArt: unknown } } }
    const hero = identityArtSvgs(PLAIN, { ...HERO_ART, idPrefix: 'app' })
    const publisher = identityArtSvgs(PUBLISHER, { ...PUBLISHER_ART, idPrefix: 'publisher' })
    expect(data.props.pageProps).toMatchObject({ art: hero, publisherArt: publisher })
    for (const svg of [hero.light, hero.dark, publisher.light, publisher.dark]) expect(html).toContain(svg)
  })

  test('nothing shifts after load', async ({ page }) => {
    await page.goto(`/app/${COVERED}`)
    expect(await layoutShift(page)).toBeLessThan(0.01)
  })
})

for (const theme of ['light', 'dark'] as const) {
  for (const [label, did] of [
    ['with cover', COVERED],
    ['without cover', PLAIN],
  ] as const) {
    test(`an app ${label} has no serious axe violations (${theme})`, async ({ page }, testInfo) => {
      await useTheme(page, theme)
      await page.goto(`/app/${did}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expectNoSeriousA11yViolations(page)
      await page.getByRole('button', { name: 'Verified app identity' }).click()
      await expectNoSeriousA11yViolations(page)
      await attachScreenshots(page, testInfo, `app-${label.replace(' ', '-')}-${theme}`)
    })
  }
}
