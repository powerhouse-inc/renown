import { test, expect, type Page, type Route } from '@playwright/test'
import { notificationHref, notificationText } from '../lib/orgs/notifications'
import type { OrgNotification } from '../services/orgs'
import { orgInvite, orgSummary, serveOrgReads } from './support/org-fixtures'
import { signedWrite } from './support/org-manage'
import { fixtureStub, STUB_SWITCHBOARD_URL } from './support/stub-switchboard-client'
import { signInTestWallet } from './support/test-session'

const SESSION = '0x0a00000000000000000000000000000000000c01'
const INBOX_ORG = orgSummary({ id: 'org-inbox-1', handle: 'acme-inbox', name: 'Acme Inbox' })

function note(
  kind: OrgNotification['kind'],
  payload: Record<string, unknown>,
  over: Partial<OrgNotification> = {},
): OrgNotification {
  return {
    id: `n-${kind}`,
    kind,
    orgId: INBOX_ORG.id,
    org: INBOX_ORG,
    payload: JSON.stringify(payload),
    createdAt: '2026-10-12T10:00:00.000Z',
    readAt: null,
    ...over,
  }
}

/** The site chrome's Renown session stand-in (NEXT_PUBLIC_E2E_AUTH=1) with a bearer. */
async function standInSession(page: Page): Promise<void> {
  await page.addInitScript((address) => {
    const w = window as unknown as Record<string, unknown>
    w.__renownE2eSession = { address, calls: [] }
    w.__renownE2eBearer = 'e2e-account-bearer'
  }, SESSION)
}

test.describe('notification wording', () => {
  test('says what happened and links to where to act', () => {
    expect(notificationText(note('INVITED', { inviteId: 'i1', role: 'PUBLISHER' }))).toBe(
      'Acme Inbox invited you to join as Publisher.',
    )
    expect(notificationHref(note('INVITED', {}))).toBe('/me#organisations')
    expect(
      notificationText(
        note('INVITE_ACCEPTED', {
          address: '0x0b000000000000000000000000000000000000b2',
          role: 'MEMBER',
        }),
      ),
    ).toBe('0x0b00…00b2 joined Acme Inbox as Member.')
    expect(notificationText(note('ROLE_CHANGED', { from: 'MEMBER', to: 'ADMIN' }))).toBe(
      'Your role in Acme Inbox is now Admin.',
    )
    expect(
      notificationText(note('PROPOSAL_NEEDS_APPROVAL', { proposalId: 'p1', kind: 'ADD_OWNER' })),
    ).toBe('A proposal to add an owner in Acme Inbox needs your approval.')
    expect(notificationHref(note('PROPOSAL_NEEDS_APPROVAL', {}))).toBe(
      '/org/acme-inbox/manage/security',
    )
    expect(
      notificationText(
        note('PROPOSAL_EXECUTED', {
          proposalId: 'p1',
          kind: 'CHANGE_HANDLE',
          reason: 'The handle is taken',
        }),
      ),
    ).toBe('The proposal to change the handle in Acme Inbox failed: The handle is taken.')
    expect(
      notificationText(note('PROPOSAL_CANCELLED', { kind: 'DELETE_ORG', status: 'EXPIRED' })),
    ).toBe('The proposal to delete the organisation in Acme Inbox expired.')
    expect(
      notificationText(note('RECOVERY_STARTED', { kind: 'RECOVER', domain: 'acme.example' })),
    ).toBe(
      'Someone started recovering Acme Inbox through acme.example. Any owner can cancel it within 7 days.',
    )
    expect(notificationHref(note('APP_TRANSFER_REQUEST', { from: INBOX_ORG.id }))).toBe(
      '/me#app-transfers',
    )
    expect(
      notificationHref(
        note('APP_TRANSFER_REQUEST', { from: '0x0b000000000000000000000000000000000000b2' }),
      ),
    ).toBe('/org/acme-inbox/manage/apps')
    expect(notificationText(note('DOMAIN_LAPSED', { domain: 'acme.example' }))).toBe(
      'acme.example is no longer verified for Acme Inbox.',
    )
    expect(notificationText(note('INVITED', {}, { org: null, payload: 'not json' }))).toBe(
      'An organisation invited you to join as Member.',
    )
  })
})

test.describe('header and inbox', () => {
  test('the bell shows the unread count, read with the bearer', async ({ page }) => {
    await standInSession(page)
    const auth: string[] = []
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
      const { query } = route.request().postDataJSON() as { query: string }
      if (!query.includes('query MyUnreadNotificationCount')) return route.continue()
      auth.push(route.request().headers()['authorization'] ?? '')
      return route.fulfill({ json: { data: { myUnreadNotificationCount: 3 } } })
    })
    await page.goto('/trust')
    const bell = page.getByRole('link', { name: 'Notifications, 3 unread' })
    await expect(bell).toBeVisible({ timeout: 30_000 })
    await expect(bell).toHaveAttribute('href', '/notifications')
    expect(auth[0]).toBe('Bearer e2e-account-bearer')
  })

  test('the bell asks again once when the bearer was refused (401)', async ({ page }) => {
    await standInSession(page)
    let calls = 0
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
      const { query } = route.request().postDataJSON() as { query: string }
      if (!query.includes('query MyUnreadNotificationCount')) return route.continue()
      calls += 1
      if (calls === 1) return route.fulfill({ status: 401, json: { error: 'Verification failed' } })
      return route.fulfill({ json: { data: { myUnreadNotificationCount: 2 } } })
    })
    await page.goto('/trust')
    await expect(page.getByRole('link', { name: 'Notifications, 2 unread' })).toBeVisible({ timeout: 30_000 })
    expect(calls).toBeGreaterThanOrEqual(2)
  })

  test('the account menu lists my organisations, remembers the last one and offers to create one', async ({
    page,
  }) => {
    await standInSession(page)
    const beta = {
      ...orgSummary({ id: 'org-menu-2', handle: 'beta-menu', name: 'Beta Menu' }),
      archived: false,
    }
    await serveOrgReads(page, {
      OrgsByMember: () => ({
        organizationsByMember: [
          {
            role: 'OWNER',
            hidden: false,
            org: {
              ...orgSummary({ id: 'org-menu-1', handle: 'acme-menu', name: 'Acme Menu' }),
              archived: false,
            },
          },
          { role: 'MEMBER', hidden: true, org: beta },
        ],
      }),
    })
    await page.goto('/trust')
    await page.getByRole('button', { name: /Account menu/ }).click()
    const group = page.getByRole('group', { name: 'Your organisations' })
    await expect(group.getByRole('menuitem')).toHaveCount(3)
    await expect(group.getByRole('menuitem', { name: 'Create organisation' })).toHaveAttribute(
      'href',
      '/org/new',
    )
    await group.getByRole('menuitem', { name: /Beta Menu/ }).click()
    await expect(page).toHaveURL(/\/org\/beta-menu\/manage\/members$/, { timeout: 30_000 })
    expect(await page.evaluate(() => localStorage.getItem('renown.activeOrg'))).toBe('org-menu-2')
    await page.goto('/trust')
    await page.getByRole('button', { name: /Account menu/ }).click()
    const first = page
      .getByRole('group', { name: 'Your organisations' })
      .getByRole('menuitem')
      .first()
    await expect(first).toContainText('Beta Menu')
    await expect(first).toHaveAttribute('aria-current', 'true')
  })

  test('the inbox lists notifications, filters unread and marks all as read', async ({ page }) => {
    await standInSession(page)
    const marked: { variables: unknown; authorization: string }[] = []
    const unreadOnly: unknown[] = []
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
      const body = route.request().postDataJSON() as {
        query: string
        variables: Record<string, unknown>
      }
      if (body.query.includes('query MyNotifications')) {
        unreadOnly.push(body.variables.unreadOnly)
        return route.fulfill({
          json: {
            data: {
              myNotifications: {
                items: [
                  note('INVITED', { inviteId: 'i1', role: 'PUBLISHER' }),
                  note('PROPOSAL_NEEDS_APPROVAL', { proposalId: 'p1', kind: 'ADD_OWNER' }),
                  note(
                    'ROLE_CHANGED',
                    { from: 'MEMBER', to: 'ADMIN' },
                    { readAt: '2026-10-12T11:00:00.000Z' },
                  ),
                ],
                next: null,
              },
            },
          },
        })
      }
      if (body.query.includes('mutation MarkNotificationsRead')) {
        marked.push({
          variables: body.variables,
          authorization: route.request().headers()['authorization'] ?? '',
        })
        return route.fulfill({ json: { data: { markNotificationsRead: 2 } } })
      }
      return route.continue()
    })
    await page.goto('/notifications')
    const list = page.getByRole('list', { name: 'Notifications' })
    await expect(
      list.getByRole('link', { name: /Acme Inbox invited you to join as Publisher\./ }),
    ).toHaveAttribute('href', '/me#organisations')
    await expect(list.getByRole('link', { name: /needs your approval/ })).toHaveAttribute(
      'href',
      '/org/acme-inbox/manage/security',
    )
    await expect(list.getByText('Unread', { exact: true })).toHaveCount(2)
    await page.getByRole('button', { name: 'Mark all as read' }).click()
    await expect(list.getByText('Unread', { exact: true })).toHaveCount(0)
    expect(marked).toEqual([
      { variables: { all: true }, authorization: 'Bearer e2e-account-bearer' },
    ])
    await page.getByRole('button', { name: 'Unread', exact: true }).click()
    await expect.poll(() => unreadOnly.includes(true)).toBe(true)
  })

  test('the inbox asks visitors to sign in', async ({ page }) => {
    await page.goto('/notifications')
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('button', { name: 'Sign in', exact: true }).last()).toBeVisible()
  })
})

test.describe('/me organisations', () => {
  test('accepts an invite, hides a membership and leaves an organisation', async ({ page }) => {
    const wallet = await signInTestWallet(page, { bearer: 'e2e-me-orgs' })
    const me = wallet.address.toLowerCase()
    const inviting = orgSummary({
      id: crypto.randomUUID(),
      handle: 'acme-invite',
      name: 'Acme Invite',
    })
    const home = {
      ...orgSummary({ id: crypto.randomUUID(), handle: 'acme-home', name: 'Acme Home' }),
      archived: false,
    }
    await serveOrgReads(page, {
      OrgsByMember: () => ({
        organizationsByMember: [{ role: 'PUBLISHER', hidden: false, org: home }],
      }),
      MyOrgInvites: () => ({
        myOrgInvites: [
          orgInvite({
            id: 'inv-me',
            orgId: inviting.id,
            org: inviting,
            address: me,
            role: 'PUBLISHER',
          }),
        ],
      }),
    })
    for (const [name, orgId, value] of [
      ['RespondToOrgInvite', inviting.id, { id: 'inv-me' }],
      ['SetMyOrgMembershipHidden', home.id, { id: 'm-home' }],
      ['LeaveOrganization', home.id, true],
    ] as const) {
      await fixtureStub({
        match: `mutation ${name}`,
        variables: orgId,
        response: { data: { [name.charAt(0).toLowerCase() + name.slice(1)]: value } },
      })
    }
    await page.goto('/me')
    const section = page.getByRole('region', { name: 'Organisations' })
    await expect(section).toBeVisible({ timeout: 30_000 })
    const row = section
      .getByRole('list', { name: 'Your organisations' })
      .getByRole('listitem')
      .filter({ hasText: 'Acme Home' })
    // Both reads have landed before the first click: a click that races the
    // initial load (cold route, slow machine) is not what this test is about.
    await expect(row).toBeVisible({ timeout: 30_000 })
    const join = section.getByRole('button', { name: 'Join Acme Invite' })
    await expect(join).toBeEnabled({ timeout: 30_000 })
    await join.click()
    expect(await signedWrite(wallet, 'respondToOrgInvite', inviting.id)).toEqual({
      orgId: inviting.id,
      inviteId: 'inv-me',
      accept: true,
    })
    // The success toast is the write's end (the buttons are busy until then and
    // the lists re-read after it): each step starts from a settled page.
    await expect(page.getByText('You joined Acme Invite.')).toBeVisible()
    await expect(row.getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      '/org/acme-home/manage/members',
    )
    await row.getByRole('button', { name: 'Hide from public lists' }).click()
    expect(await signedWrite(wallet, 'setMyOrgMembershipHidden', home.id)).toEqual({
      orgId: home.id,
      hidden: true,
    })
    await expect(page.getByText('You are hidden from Acme Home’s public lists.')).toBeVisible()
    await row.getByRole('button', { name: 'Leave Acme Home' }).click()
    await row.getByRole('button', { name: 'Yes, leave Acme Home' }).click()
    expect(await signedWrite(wallet, 'leaveOrganization', home.id)).toEqual({ orgId: home.id })
  })
})

const ORG_API = `${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`

/** Counts the unread-count requests and answers them (3 unread). */
async function countUnreadRequests(page: Page): Promise<{ count: number }> {
  const seen = { count: 0 }
  await page.route(ORG_API, async (route: Route) => {
    const { query } = route.request().postDataJSON() as { query: string }
    if (!query.includes('query MyUnreadNotificationCount')) return route.fallback()
    seen.count += 1
    return route.fulfill({ json: { data: { myUnreadNotificationCount: 3 } } })
  })
  return seen
}

test.describe('unread polling', () => {
  test('polls every minute while visible, not while hidden, and not after the header unmounts', async ({ page }) => {
    await standInSession(page)
    await page.addInitScript(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => ((window as unknown as { __hidden?: boolean }).__hidden ? 'hidden' : 'visible'),
      })
    })
    await page.clock.install()
    const seen = await countUnreadRequests(page)
    await page.goto('/trust')
    await expect(page.getByRole('link', { name: 'Notifications, 3 unread' })).toBeVisible({ timeout: 30_000 })
    const first = seen.count
    await page.clock.runFor(60_000)
    await expect.poll(() => seen.count).toBeGreaterThan(first)

    await page.evaluate(() => ((window as unknown as { __hidden: boolean }).__hidden = true))
    const whileHidden = seen.count
    await page.clock.runFor(180_000)
    expect(seen.count).toBe(whileHidden)

    await page.evaluate(() => ((window as unknown as { __hidden: boolean }).__hidden = false))
    // The header goes away with the page layout (auth screens have none): its timer must stop.
    await page.evaluate(() => (window as unknown as { next: { router: { push: (url: string) => void } } }).next.router.push('/oidc/login'))
    await expect(page.getByRole('link', { name: /Notifications/ })).toHaveCount(0)
    await page.waitForTimeout(500)
    const afterUnmount = seen.count
    await page.clock.runFor(180_000)
    expect(seen.count).toBe(afterUnmount)
  })

  test('an anonymous visitor makes no unread or notification requests', async ({ page }) => {
    const queries: string[] = []
    await page.route(ORG_API, async (route: Route) => {
      queries.push((route.request().postDataJSON() as { query: string }).query)
      return route.fallback()
    })
    await page.goto('/trust')
    await expect(page.getByRole('button', { name: 'Sign in', exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(1500)
    expect(queries.filter((q) => /MyUnreadNotificationCount|MyNotifications/.test(q))).toEqual([])
    await expect(page.getByRole('link', { name: /^Notifications/ })).toHaveCount(0)
  })

  test('the count arrives soon after the bearer becomes available, without waiting a minute', async ({ page }) => {
    await page.addInitScript((address) => {
      const w = window as unknown as Record<string, unknown>
      w.__renownE2eSession = { address, calls: [] }
      // No bearer yet: Renown is still starting.
    }, SESSION)
    await page.clock.install()
    const seen = await countUnreadRequests(page)
    await page.goto('/trust')
    await page.clock.runFor(100)
    await page.evaluate(() => ((window as unknown as Record<string, unknown>).__renownE2eBearer = 'e2e-late-bearer'))
    await page.clock.runFor(4_000)
    await expect(page.getByRole('link', { name: 'Notifications, 3 unread' })).toBeVisible({ timeout: 30_000 })
    // Only ~4 s of page time passed: the 60 s poll cannot have been what answered.
    expect(seen.count).toBeGreaterThan(0)
  })
})

test.describe('hostile notification content', () => {
  const HOSTILE_ORG = orgSummary({ id: 'org-evil', handle: 'evil-org', name: '<img src=x onerror=window.__pwned=1>Evil' })
  const hostile = [
    note('INVITED', { role: '<img src=x onerror=window.__pwned=1>' }, { id: 'h1', org: HOSTILE_ORG, orgId: HOSTILE_ORG.id }),
    note('DOMAIN_LAPSED', { domain: 'javascript:alert(1)//' }, { id: 'h2', org: HOSTILE_ORG, orgId: HOSTILE_ORG.id }),
    note('APP_TRANSFER_REQUEST', { from: '//evil.example/steal', href: 'https://evil.example', url: 'javascript:alert(1)' }, { id: 'h3', org: HOSTILE_ORG, orgId: HOSTILE_ORG.id }),
    note('PROPOSAL_EXECUTED', { kind: '<script>window.__pwned=1</script>', reason: '<b>bold</b> https://evil.example' }, { id: 'h4', org: HOSTILE_ORG, orgId: HOSTILE_ORG.id }),
    note('ROLE_CHANGED', { to: 'javascript:alert(1)' }, { id: 'h5', org: { ...HOSTILE_ORG, handle: 'a/../..//evil.example' }, orgId: HOSTILE_ORG.id }),
  ]

  test('wording and links stay internal', () => {
    for (const n of hostile) {
      const href = notificationHref(n)
      expect(href, n.id).toMatch(/^\/(?!\/)/)
      expect(href, n.id).not.toMatch(/javascript:|https?:|\/\/evil/i)
      expect(notificationText(n).length).toBeGreaterThan(0)
    }
    expect(notificationHref(hostile[4]!)).not.toContain('../')
  })

  test('the inbox renders it as text and every link is an internal route', async ({ page }) => {
    await standInSession(page)
    await serveOrgReads(page, { MyNotifications: () => ({ myNotifications: { items: hostile, next: null } }) })
    await page.goto('/notifications')
    const list = page.getByRole('list', { name: 'Notifications' })
    await expect(list.getByRole('listitem')).toHaveCount(hostile.length, { timeout: 30_000 })
    await expect(list.getByText('<img src=x onerror=window.__pwned=1>Evil invited you', { exact: false })).toBeVisible()
    expect(await list.locator('img, script, b').count()).toBe(0)
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
    const hrefs = await list.getByRole('link').evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''))
    expect(hrefs).toHaveLength(hostile.length)
    for (const href of hrefs) expect(href).toMatch(/^\/(?!\/)/)
  })
})

test.describe('account menu failure', () => {
  test('shows a small error with a retry when the organisations do not load', async ({ page }) => {
    await standInSession(page)
    let failing = true
    await page.route(ORG_API, async (route: Route) => {
      const { query } = route.request().postDataJSON() as { query: string }
      if (!query.includes('query OrgsByMember')) return route.fallback()
      if (failing) return route.fulfill({ status: 500, json: { errors: [{ message: 'boom' }] } })
      return route.fulfill({ json: { data: { organizationsByMember: [] } } })
    })
    await page.goto('/trust')
    await page.getByRole('button', { name: /Account menu/ }).click()
    const group = page.getByRole('group', { name: 'Your organisations' })
    await expect(group.getByRole('alert')).toContainText('did not load', { timeout: 30_000 })
    failing = false
    await group.getByRole('menuitem', { name: 'Try again' }).click()
    await expect(group.getByRole('alert')).toHaveCount(0)
    await expect(group.getByRole('menuitem', { name: 'Create organisation' })).toBeVisible()
  })
})
