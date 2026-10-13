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
    expect(calls).toBe(2)
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
    await section.getByRole('button', { name: 'Join Acme Invite' }).click()
    expect(await signedWrite(wallet, 'respondToOrgInvite', inviting.id)).toEqual({
      orgId: inviting.id,
      inviteId: 'inv-me',
      accept: true,
    })

    const row = section
      .getByRole('list', { name: 'Your organisations' })
      .getByRole('listitem')
      .filter({ hasText: 'Acme Home' })
    await expect(row.getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      '/org/acme-home/manage/members',
    )
    await row.getByRole('button', { name: 'Hide from public lists' }).click()
    expect(await signedWrite(wallet, 'setMyOrgMembershipHidden', home.id)).toEqual({
      orgId: home.id,
      hidden: true,
    })
    await row.getByRole('button', { name: 'Leave Acme Home' }).click()
    await row.getByRole('button', { name: 'Yes, leave Acme Home' }).click()
    expect(await signedWrite(wallet, 'leaveOrganization', home.id)).toEqual({ orgId: home.id })
  })
})
