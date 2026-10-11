import { test, expect, type Page, type Route } from '@playwright/test'
import {
  decorativePaintProblems,
  horizontalOverflow,
  overlappingText,
  settle,
  strayDecorativeLayers,
  surfaceProblems,
  trappedFixedElements,
  type SurfaceSpec,
} from './support/layout-invariants'
import { useTheme, type Theme } from './support/site'
import { fixtureStub, STUB_SWITCHBOARD_URL } from './support/stub-switchboard-client'
import { signInTestWallet } from './support/test-session'

// Layout guards: every public page x 390/1280 px x light/dark, and every
// interactive surface open, must keep the geometric rules in
// e2e/support/layout-invariants.ts. A full-page screenshot of each case is
// attached to the report for a human look (no pixel baselines).
//
// To cover a new page or state, add one line to PAGES or STATES.

const ADDRESS = '0x5e00000000000000000000000000000000001a01'
const APP_DID = 'did:key:z6MkLayoutGuardAppxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
const PROFILE = {
  documentId: 'doc-layout-1',
  username: null,
  ethAddress: ADDRESS,
  userImage: null,
  displayName: 'Lena Layout',
  handle: 'lena-layout',
  bio: 'Checks that every panel keeps its shape, on every screen.',
  links: [{ id: 'l1', label: 'Site', url: 'https://lena.example' }],
  avatar: null,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-10-09T10:00:00.000Z',
}
const APP = {
  appDid: APP_DID,
  documentId: 'doc-layout-app',
  name: 'Layout Ledger',
  tagline: 'Books that balance on every screen',
  logo: null,
  website: 'https://ledger.example',
  publisherDid: `did:pkh:eip155:1:${ADDRESS}`,
  description: 'A ledger app used by the layout guards.',
  category: 'Ledgers',
  logoRef: null,
  coverRef: null,
  links: [],
}

test.beforeAll(async () => {
  const users = { data: { renownUsers: [PROFILE] } }
  await fixtureStub({ match: 'renownUsers', variables: '"lena-layout"', response: users })
  await fixtureStub({ match: 'renownUsers', variables: ADDRESS, response: users })
  await fixtureStub({ match: 'appProfile(', variables: APP_DID, response: { data: { appProfile: APP } } })
  await fixtureStub({ match: 'appProfilesByPublisher(', variables: ADDRESS, response: { data: { appProfilesByPublisher: [APP] } } })
})

/** /me for a signed-in test wallet with one connected app, answered in the browser (parallel-safe). */
async function openSignedInMe(page: Page): Promise<void> {
  const wallet = await signInTestWallet(page)
  const issuerId = `did:pkh:eip155:1:${wallet.address.toLowerCase()}`
  const day = 86_400_000
  await page.route(`${STUB_SWITCHBOARD_URL}/graphql**`, async (route: Route) => {
    const { query } = route.request().postDataJSON() as { query: string }
    if (query.includes('renownCredentials')) {
      return route.fulfill({
        json: {
          data: {
            renownCredentials: [
              {
                documentId: 'doc-layout-cred',
                credentialId: 'urn:uuid:layout-cred',
                issuerId,
                issuanceDate: new Date(Date.now() - 2 * day).toISOString(),
                expirationDate: new Date(Date.now() + 5 * day).toISOString(),
                credentialSubjectId: APP_DID,
                credentialSubjectApp: 'layout',
                revoked: false,
              },
            ],
          },
        },
      })
    }
    if (query.includes('SubjectAppProfiles')) return route.fulfill({ json: { data: { p0: APP } } })
    if (query.includes('renownUsers')) {
      return route.fulfill({ json: { data: { renownUsers: [{ ...PROFILE, documentId: 'doc-layout-me', ethAddress: wallet.address.toLowerCase() }] } } })
    }
    return route.continue()
  })
  await page.goto('/me')
  await expect(page.getByRole('heading', { level: 2, name: 'Connected apps' })).toBeVisible({ timeout: 30_000 })
}

/** A Renown session stand-in (NEXT_PUBLIC_E2E_AUTH=1) whose browser wallet shows another account. */
async function standInSwitchedWallet(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.__renownE2eSession = { address: '0x5e00000000000000000000000000000000001a02', calls: [] }
    // This browser's wallet was seen on the session's account before (components/site/account-switch-prompt.tsx).
    localStorage.setItem('renown:injected-session:0x5e00000000000000000000000000000000001a02', '1')
    w.ethereum = {
      request: async () => ['0x5e00000000000000000000000000000000001a03'],
      on: () => undefined,
      removeListener: () => undefined,
    }
  })
}

interface LayoutPage {
  name: string
  /** Loads the page and waits until it shows its content. */
  open: (page: Page) => Promise<void>
}

const visit = (path: string, heading: string) => async (page: Page) => {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({ timeout: 30_000 })
}

const PAGES: LayoutPage[] = [
  { name: 'home', open: visit('/', 'One identity for the Powerhouse network') },
  { name: 'apps', open: visit('/apps', 'Apps on Renown') },
  { name: 'developers', open: visit('/developers', 'Build with Renown') },
  { name: 'trust', open: visit('/trust', 'Check how Renown works, not just what we say') },
  { name: 'ecosystem', open: visit('/ecosystem', 'One identity across the Powerhouse network') },
  { name: 'profile', open: visit('/@lena-layout', 'Lena Layout') },
  { name: 'app', open: visit(`/app/${APP_DID}`, 'Layout Ledger') },
  { name: 'me', open: openSignedInMe },
]

interface LayoutState {
  name: string
  /** A name from PAGES. */
  page: string
  widths: readonly number[]
  /** Runs before the page loads (init scripts). */
  prepare?: (page: Page) => Promise<void>
  /** Opens the surface and returns what it must satisfy. */
  open: (page: Page) => Promise<SurfaceSpec>
}

const openSheet = (button: string, region: string) => async (page: Page): Promise<SurfaceSpec> => {
  await page.getByRole('button', { name: button, exact: true }).first().click()
  const panel = page.getByRole('region', { name: region }).first()
  await expect(panel).toBeVisible()
  return { panel }
}

const STATES: LayoutState[] = [
  {
    name: 'mobile menu open',
    page: 'home',
    widths: [390],
    open: async (page) => {
      await page.getByRole('button', { name: 'Open menu' }).click()
      const panel = page.getByRole('dialog', { name: 'Menu' })
      await expect(panel).toBeVisible()
      return { panel, overlay: panel.locator('xpath=..') }
    },
  },
  { name: 'share sheet open', page: 'profile', widths: [390, 1280], open: openSheet('Share', 'Share') },
  { name: 'verified badge open', page: 'profile', widths: [390, 1280], open: openSheet('Verified Renown identity', 'Verified Renown identity') },
  {
    name: 'revoke dialog open',
    page: 'me',
    widths: [390, 1280],
    open: async (page) => {
      await page.getByRole('region', { name: 'Connected apps' }).getByRole('button', { name: /^Revoke Layout Ledger/ }).click()
      const panel = page.getByRole('dialog', { name: 'Revoke Layout Ledger?' })
      await expect(panel).toBeVisible()
      return { panel }
    },
  },
  {
    name: 'account switch prompt',
    page: 'trust',
    widths: [390, 1280],
    prepare: (page) => standInSwitchedWallet(page),
    open: async (page) => {
      const panel = page.getByRole('region', { name: 'Wallet account changed' })
      await expect(panel).toBeVisible()
      return { panel }
    },
  },
]

const WIDTHS = [390, 1280] as const
const THEMES: Theme[] = ['light', 'dark']

// Pages whose decorative layers the paint check must find (the home call-to-action's glow and frame).
const PAINT_PROBED = new Set(['home'])

/** Every page-wide rule, plus the surface's when one is open. */
async function layoutProblems(page: Page, surface?: SurfaceSpec, pageName?: string): Promise<string[]> {
  return [
    ...(await horizontalOverflow(page)),
    ...(await trappedFixedElements(page)),
    ...(await strayDecorativeLayers(page)),
    ...(surface
      ? await surfaceProblems(page, surface)
      : await decorativePaintProblems(page, { expectProbes: pageName !== undefined && PAINT_PROBED.has(pageName) })),
    ...(await overlappingText(page, surface?.panel)),
  ]
}

test.describe('layout invariants', () => {
  test.beforeEach(() => {
    test.setTimeout(120_000)
  })

  for (const target of PAGES) {
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        test(`${target.name} at ${width} px (${theme})`, async ({ page }, testInfo) => {
          await page.setViewportSize({ width, height: 844 })
          await useTheme(page, theme)
          await target.open(page)
          await settle(page)
          const problems = await layoutProblems(page, undefined, target.name)
          await testInfo.attach(`${target.name}-${width}-${theme}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
          expect(problems).toEqual([])
        })
      }
    }
  }

  for (const state of STATES) {
    const target = PAGES.find((p) => p.name === state.page)!
    for (const width of state.widths) {
      for (const theme of THEMES) {
        test(`${target.name}: ${state.name} at ${width} px (${theme})`, async ({ page }, testInfo) => {
          await page.setViewportSize({ width, height: 844 })
          await useTheme(page, theme)
          await state.prepare?.(page)
          await target.open(page)
          await settle(page)
          const surface = await state.open(page)
          await settle(page)
          const problems = await layoutProblems(page, surface)
          await testInfo.attach(`${target.name}-${state.name.replace(/ /g, '-')}-${width}-${theme}.png`, { body: await page.screenshot(), contentType: 'image/png' })
          expect(problems).toEqual([])
        })
      }
    }
  }
})
