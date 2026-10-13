import { test, expect } from '@playwright/test'
import {
  assignableRoles,
  canRemove,
  canRevokeInvite,
  inviteRoles,
  linkExpiresAt,
  linkUsesProblem,
  parseInvitee,
} from '../lib/orgs/members'
import {
  APP_DID_A,
  membership,
  orgInvite,
  orgInviteLink,
  orgMember,
  serveOrgReads,
} from './support/org-fixtures'
import { BOB, CAROL, defaultMembers, openManagePage, signedWrite } from './support/org-manage'
import { fixtureStub, graphqlError, STUB_SWITCHBOARD_URL } from './support/stub-switchboard-client'

test.describe('member rules', () => {
  test('only the roles the viewer may grant, remove or revoke', () => {
    expect(inviteRoles('OWNER')).toEqual(['MEMBER', 'PUBLISHER', 'ADMIN'])
    expect(inviteRoles('ADMIN')).toEqual(['MEMBER', 'PUBLISHER'])
    expect(inviteRoles('PUBLISHER')).toEqual([])
    expect(assignableRoles('ADMIN', 'PUBLISHER')).toEqual(['MEMBER', 'PUBLISHER'])
    expect(assignableRoles('ADMIN', 'ADMIN')).toEqual([])
    expect(assignableRoles('OWNER', 'ADMIN')).toEqual(['MEMBER', 'PUBLISHER', 'ADMIN'])
    expect(assignableRoles('OWNER', 'OWNER')).toEqual([])
    expect(canRemove('ADMIN', 'PUBLISHER')).toBe(true)
    expect(canRemove('ADMIN', 'ADMIN')).toBe(false)
    expect(canRemove('OWNER', 'ADMIN')).toBe(true)
    expect(canRemove('OWNER', 'OWNER')).toBe(false)
    expect(canRevokeInvite('ADMIN', 'ADMIN')).toBe(false)
    expect(canRevokeInvite('OWNER', 'ADMIN')).toBe(true)
  })

  test('invitees, link expiry and uses', () => {
    expect(parseInvitee(' 0xAbC0000000000000000000000000000000000001 ')).toEqual({
      invitee: '0xabc0000000000000000000000000000000000001',
    })
    expect(parseInvitee('@Bob-Builder')).toEqual({ invitee: 'bob-builder' })
    expect(parseInvitee('bo')).toEqual({ problem: 'Enter a 0x wallet address or a Renown handle.' })
    const now = new Date('2026-10-12T12:00:00.000Z')
    expect(linkExpiresAt(7, now)).toBe('2026-10-19T12:00:00.000Z')
    // 30 days is the switchboard's limit: stay 10 minutes inside it for clock skew.
    expect(linkExpiresAt(30, now)).toBe('2026-11-11T11:50:00.000Z')
    expect(linkUsesProblem('0')).toBe('Use a whole number from 1 to 100.')
    expect(linkUsesProblem('1.5')).toBe('Use a whole number from 1 to 100.')
    expect(linkUsesProblem('101')).toBe('Use a whole number from 1 to 100.')
    expect(linkUsesProblem('100')).toBeNull()
  })
})

test.describe('manage: members', () => {
  test('asks visitors to sign in', async ({ page }) => {
    await page.goto('/org/acme-manage/manage/members')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Manage an organisation' }),
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeVisible()
  })

  test('a signed-in wallet that is not a member is told so', async ({ page }) => {
    await openManagePage(page, {
      role: 'MEMBER',
      section: 'members',
      org: { viewerMembership: null },
      ready: false,
    })
    await expect(
      page.getByRole('heading', { level: 1, name: 'You are not a member of Acme Manage' }),
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('link', { name: 'View its public page' })).toHaveAttribute(
      'href',
      '/@acme-manage',
    )
  })

  test('an admin invites a handle as publisher with one signature', async ({ page }) => {
    const setup = await openManagePage(page, { role: 'ADMIN', section: 'members' })
    await fixtureStub({
      match: 'mutation InviteOrgMember',
      variables: setup.orgId,
      response: {
        data: {
          inviteOrgMember: orgInvite({
            orgId: setup.orgId,
            address: '0x0f000000000000000000000000000000000000f6',
            role: 'PUBLISHER',
          }),
        },
      },
    })
    await page.getByLabel('Address or handle').fill('not a handle!')
    await page.getByRole('button', { name: 'Send invite' }).click()
    await expect(page.getByText('Enter a 0x wallet address or a Renown handle.')).toBeVisible()
    await page.getByLabel('Address or handle').fill('@Bob-Builder2')
    await page.getByLabel('Role', { exact: true }).first().selectOption('PUBLISHER')
    await page.getByRole('button', { name: 'Send invite' }).click()
    await expect(page.getByText('Invite sent to bob-builder2.')).toBeVisible()
    expect(await signedWrite(setup.wallet, 'inviteOrgMember', setup.orgId)).toEqual({
      orgId: setup.orgId,
      invitee: 'bob-builder2',
      role: 'PUBLISHER',
    })
  })

  test('offers only the roles the viewer may grant', async ({ page, browser }) => {
    await openManagePage(page, { role: 'ADMIN', section: 'members' })
    const rows = page.getByRole('list', { name: 'Members' }).getByRole('listitem')
    await expect(
      rows.filter({ hasText: 'Bob Builder' }).getByLabel('Role of Bob Builder').locator('option'),
    ).toHaveText(['Member', 'Publisher'])
    const owner = rows.filter({ hasText: 'Olga Owner' })
    await expect(owner.getByText('Owner', { exact: true })).toBeVisible()
    await expect(owner.getByRole('combobox')).toHaveCount(0)
    await expect(owner.getByRole('button', { name: /Remove/ })).toHaveCount(0)
    const ownerPage = await browser.newPage()
    await openManagePage(ownerPage, { role: 'OWNER', section: 'members' })
    await expect(
      ownerPage
        .getByRole('list', { name: 'Members' })
        .getByLabel('Role of Bob Builder')
        .locator('option'),
    ).toHaveText(['Member', 'Publisher', 'Admin'])
    await ownerPage.close()
  })

  test('creates an invite link and shows it once', async ({ page }) => {
    const setup = await openManagePage(page, { role: 'ADMIN', section: 'members' })
    const token = 'manageLinkTokenAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    await fixtureStub({
      match: 'mutation CreateOrgInviteLink',
      variables: setup.orgId,
      response: {
        data: {
          createOrgInviteLink: {
            link: orgInviteLink({ orgId: setup.orgId, role: 'PUBLISHER', maxUses: 5 }),
            token,
          },
        },
      },
    })
    await page.getByLabel('Role', { exact: true }).nth(1).selectOption('PUBLISHER')
    await page.getByLabel('Uses').fill('5')
    await page.getByLabel('Expires after').selectOption('30')
    const before = Date.now()
    await page.getByRole('button', { name: 'Create invite link' }).click()
    const shown = page.getByRole('region', { name: 'New invite link' })
    await expect(shown).toContainText(`http://localhost:3000/invite/${token}`)
    await expect(shown).toContainText('Renown shows it only once')
    const args = await signedWrite(setup.wallet, 'createOrgInviteLink', setup.orgId)
    expect(args).toMatchObject({ orgId: setup.orgId, role: 'PUBLISHER', maxUses: 5 })
    const expires = Date.parse(String(args.expiresAt))
    expect(expires).toBeGreaterThan(before + 30 * 86_400_000 - 11 * 60_000)
    expect(expires).toBeLessThanOrEqual(Date.now() + 30 * 86_400_000 - 10 * 60_000)
  })

  test('removes a member after confirming, revokes an invite and sets app access', async ({
    page,
  }) => {
    const setup = await openManagePage(page, { role: 'ADMIN', section: 'members' })
    const answer = (name: string, value: unknown) =>
      fixtureStub({
        match: `mutation ${name}`,
        variables: setup.orgId,
        response: { data: { [name.charAt(0).toLowerCase() + name.slice(1)]: value } },
      })
    await answer(
      'RemoveOrgMember',
      orgMember({ orgId: setup.orgId, address: CAROL, status: 'REMOVED' }),
    )
    await answer(
      'RevokeOrgInvite',
      orgInvite({
        orgId: setup.orgId,
        address: '0x0d000000000000000000000000000000000000d4',
        status: 'REVOKED',
      }),
    )
    await answer(
      'SetOrgMemberAppScope',
      orgMember({ orgId: setup.orgId, address: BOB, role: 'PUBLISHER' }),
    )
    const rows = page.getByRole('list', { name: 'Members' }).getByRole('listitem')

    await rows
      .filter({ hasText: 'Carol Member' })
      .getByRole('button', { name: 'Remove Carol Member' })
      .click()
    await page.getByRole('button', { name: 'Yes, remove Carol Member' }).click()
    expect(await signedWrite(setup.wallet, 'removeOrgMember', setup.orgId)).toEqual({
      orgId: setup.orgId,
      address: CAROL,
    })

    await page.getByRole('button', { name: 'Revoke the invite for 0x0d00…00d4' }).click()
    expect(await signedWrite(setup.wallet, 'revokeOrgInvite', setup.orgId)).toEqual({
      orgId: setup.orgId,
      inviteId: 'inv-dave',
    })

    const bob = rows.filter({ hasText: 'Bob Builder' })
    await bob.getByRole('button', { name: 'App access' }).click()
    await bob.getByLabel('Only these apps').check()
    await bob.getByLabel(APP_DID_A).check()
    await bob.getByRole('button', { name: 'Save app access' }).click()
    expect(await signedWrite(setup.wallet, 'setOrgMemberAppScope', setup.orgId)).toEqual({
      orgId: setup.orgId,
      address: BOB,
      appScope: { all: false, appDids: [APP_DID_A] },
    })
  })

  test('an archived or taken-down organisation is read-only, even with no membership', async ({
    page,
    browser,
  }) => {
    await openManagePage(page, {
      role: 'ADMIN',
      section: 'members',
      org: { takenDown: true, viewerMembership: null },
      ready: false,
    })
    await expect(
      page.getByText('This organisation was taken down; nothing can be changed.'),
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('heading', { level: 1, name: /You are not a member/ })).toHaveCount(
      0,
    )
    await expect(page.getByRole('button', { name: 'Send invite' })).toHaveCount(0)
    const archived = await browser.newPage()
    await openManagePage(archived, { role: 'OWNER', section: 'members', org: { archived: true } })
    await expect(
      archived.getByText('This organisation is archived; nothing can be changed.'),
    ).toBeVisible()
    await expect(archived.getByRole('list', { name: 'Members' })).toHaveCount(0)
    await archived.close()
  })

  test('a lost answer to a new invite link re-reads the links before a retry', async ({ page }) => {
    let linkReads = 0
    await openManagePage(page, {
      role: 'ADMIN',
      section: 'members',
      answers: {
        OrgInviteLinks: (variables) => {
          linkReads += 1
          return { orgInviteLinks: [orgInviteLink({ orgId: String(variables.orgId) })] }
        },
      },
    })
    await expect.poll(() => linkReads).toBe(1)
    await page.route('**/api/org/createOrgInviteLink', (route) => route.abort())
    await page.getByRole('button', { name: 'Create invite link' }).click()
    await expect(
      page.getByText('Renown did not answer, so the change may have gone through.', {
        exact: false,
      }),
    ).toBeVisible()
    await expect.poll(() => linkReads).toBe(2)
    await expect(page.getByRole('region', { name: 'New invite link' })).toHaveCount(0)
  })

  test('re-reads the members after a role change', async ({ page }) => {
    let memberReads = 0
    const setup = await openManagePage(page, {
      role: 'OWNER',
      section: 'members',
      answers: {
        OrgMembers: (variables) => {
          memberReads += 1
          return {
            organizationMembers: defaultMembers(
              String(variables.orgId),
              '0x0e000000000000000000000000000000000000e5',
              'ADMIN',
            ),
          }
        },
      },
    })
    await expect.poll(() => memberReads).toBe(1)
    await fixtureStub({
      match: 'mutation SetOrgMemberRole',
      variables: setup.orgId,
      response: {
        data: { setOrgMemberRole: orgMember({ orgId: setup.orgId, address: BOB, role: 'MEMBER' }) },
      },
    })
    await page
      .getByRole('list', { name: 'Members' })
      .getByLabel('Role of Bob Builder')
      .selectOption('MEMBER')
    await expect(page.getByText('Bob Builder is now Member.')).toBeVisible()
    expect(await signedWrite(setup.wallet, 'setOrgMemberRole', setup.orgId)).toEqual({
      orgId: setup.orgId,
      address: BOB,
      role: 'MEMBER',
    })
    await expect.poll(() => memberReads).toBe(2)
  })

  test('a write refused because the organisation was archived meanwhile turns the page read-only', async ({
    page,
  }) => {
    const setup = await openManagePage(page, { role: 'ADMIN', section: 'members' })
    await fixtureStub({
      match: 'mutation InviteOrgMember',
      variables: setup.orgId,
      response: graphqlError('The organization is archived or taken down', 'FORBIDDEN'),
    })
    // Later route handlers win: from now on the organisation reads as archived.
    await serveOrgReads(page, {
      OrgByRef: () => ({ organization: { ...setup.org, archived: true } }),
    })
    await page.getByLabel('Address or handle').fill('@carol-new')
    await page.getByRole('button', { name: 'Send invite' }).click()
    await expect(page.getByText('This organisation can no longer be changed.')).toBeVisible()
    await expect(
      page.getByText('This organisation is archived; nothing can be changed.'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send invite' })).toHaveCount(0)
  })

  test('any other refusal re-reads the organisation, so the role and controls catch up', async ({
    page,
  }) => {
    const setup = await openManagePage(page, { role: 'ADMIN', section: 'members' })
    await fixtureStub({
      match: 'mutation InviteOrgMember',
      variables: setup.orgId,
      response: graphqlError('Forbidden', 'FORBIDDEN'),
    })
    await serveOrgReads(page, {
      OrgByRef: () => ({
        organization: {
          ...setup.org,
          viewerMembership: membership(setup.orgId, setup.me, 'MEMBER'),
        },
      }),
    })
    await page.getByLabel('Address or handle').fill('@carol-new')
    await page.getByRole('button', { name: 'Send invite' }).click()
    await expect(page.getByText('Your role: Member')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send invite' })).toHaveCount(0)
  })

  test('creating waits for the re-read after a lost answer; revoking the new link hides it', async ({
    page,
  }) => {
    const setup = await openManagePage(page, { role: 'ADMIN', section: 'members' })
    const create = page
      .getByRole('main')
      .getByRole('button', { name: /Create invite link|Checking the links/ })
    await expect(create).toHaveText('Create invite link')
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route) => {
      const body = route.request().postDataJSON() as { query: string }
      if (!/^\s*query OrgInviteLinks/.test(body.query)) return route.fallback()
      await gate
      return route.fallback()
    })
    await page.route('**/api/org/createOrgInviteLink', (route) => route.abort())
    await create.click()
    await expect(create).toHaveText('Checking the links…')
    await expect(create).toBeDisabled()
    release()
    await expect(create).toHaveText('Create invite link')
    await expect(create).toBeEnabled()

    await page.unroute('**/api/org/createOrgInviteLink')
    const token = 'revokedLinkTokenAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    await fixtureStub({
      match: 'mutation CreateOrgInviteLink',
      variables: setup.orgId,
      response: {
        data: { createOrgInviteLink: { link: orgInviteLink({ orgId: setup.orgId }), token } },
      },
    })
    await fixtureStub({
      match: 'mutation RevokeOrgInviteLink',
      variables: setup.orgId,
      response: {
        data: { revokeOrgInviteLink: orgInviteLink({ orgId: setup.orgId, revoked: true }) },
      },
    })
    await create.click()
    await expect(page.getByRole('region', { name: 'New invite link' })).toContainText(token)
    await page
      .getByRole('list', { name: 'Invite links' })
      .getByRole('button', { name: 'Revoke link' })
      .click()
    await expect(page.getByText('Invite link revoked.')).toBeVisible()
    await expect(page.getByRole('region', { name: 'New invite link' })).toHaveCount(0)
  })

  test('an unknown section is a 404 and the bare manage URL opens members', async ({ request }) => {
    expect((await request.get('/org/acme-manage/manage/nope')).status()).toBe(404)
    const bare = await request.get('/org/acme-manage/manage', { maxRedirects: 0 })
    expect(bare.status()).toBe(307)
    expect(bare.headers().location).toBe('/org/acme-manage/manage/members')
  })
})
