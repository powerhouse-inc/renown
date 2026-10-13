import { test, expect } from '@playwright/test'
import { settingsFormFrom, settingsPatch } from '../lib/orgs/settings-form'
import { slugFromName, teamPatch, teamProblems } from '../lib/orgs/teams'
import { APP_DID_A, organization, orgProposal } from './support/org-fixtures'
import { BOB, CAROL, openManagePage, signedWrite } from './support/org-manage'
import { fixtureStub } from './support/stub-switchboard-client'

const CORE = { id: 'team-core', orgId: 'x', slug: 'core', name: 'Core', appDids: [APP_DID_A], memberAddresses: [BOB] }

/** A standing answer for `name` (the mutation's operation name) for this organisation only. */
async function answer(orgId: string, name: string, value: unknown) {
  await fixtureStub({ match: `mutation ${name}`, variables: orgId, response: { data: { [name.charAt(0).toLowerCase() + name.slice(1)]: value } } })
}

test.describe('team and settings rules', () => {
  test('team slugs, names and patches', () => {
    expect(teamProblems({ slug: 'Core', name: ' ' })).toEqual({
      slug: 'Use 1 to 40 lowercase letters, digits or hyphens, starting and ending with a letter or digit.',
      name: 'Give the team a name.',
    })
    expect(teamProblems({ slug: 'web', name: 'Web' })).toEqual({})
    expect(slugFromName('Web & Mobile')).toBe('web-mobile')
    expect(teamPatch(CORE, { slug: 'core', name: ' Core team ', appDids: [APP_DID_A] })).toEqual({ name: 'Core team' })
    expect(teamPatch(CORE, { slug: 'core', name: 'Core', appDids: [] })).toEqual({ appDids: [] })
  })

  test('settings send only what changed, and "" to clear', () => {
    const initial = settingsFormFrom(organization({ name: 'Acme', bio: 'Hi', website: 'https://acme.example' }))
    expect(settingsPatch(initial, initial)).toEqual({})
    expect(settingsPatch(initial, { ...initial, name: ' Acme Ltd ', website: '' })).toEqual({ name: 'Acme Ltd', website: '' })
    expect(settingsPatch(initial, { ...initial, links: [{ id: 'l1', label: ' Site ', url: 'https://acme.example ' }] })).toEqual({
      links: [{ id: 'l1', label: 'Site', url: 'https://acme.example' }],
    })
  })
})

test.describe('manage: teams', () => {
  test('an admin creates, edits and deletes a team', async ({ page }) => {
    const setup = await openManagePage(page, { role: 'ADMIN', section: 'teams', org: { teams: [CORE] } })
    await answer(setup.orgId, 'CreateOrgTeam', { ...CORE, id: 'team-web', slug: 'web', name: 'Web' })
    await answer(setup.orgId, 'UpdateOrgTeam', { ...CORE, name: 'Core team' })
    await answer(setup.orgId, 'SetOrgTeamMembers', { ...CORE, memberAddresses: [BOB, CAROL] })
    await answer(setup.orgId, 'DeleteOrgTeam', true)

    await page.getByLabel('Team name').fill('Web')
    await expect(page.getByLabel('Slug', { exact: true })).toHaveValue('web')
    await page.getByRole('button', { name: 'Create team' }).click()
    expect(await signedWrite(setup.wallet, 'createOrgTeam', setup.orgId)).toEqual({ orgId: setup.orgId, slug: 'web', name: 'Web' })

    await page.getByRole('button', { name: 'Edit Core' }).click()
    await page.getByLabel('Name', { exact: true }).fill('Core team')
    await page.getByLabel('Carol Member').check()
    await page.getByRole('button', { name: 'Save team' }).click()
    expect(await signedWrite(setup.wallet, 'updateOrgTeam', setup.orgId)).toEqual({ orgId: setup.orgId, teamId: 'team-core', name: 'Core team' })
    expect(await signedWrite(setup.wallet, 'setOrgTeamMembers', setup.orgId)).toEqual({
      orgId: setup.orgId,
      teamId: 'team-core',
      addresses: [BOB, CAROL],
    })

    await page.getByRole('button', { name: 'Delete Core' }).click()
    await page.getByRole('button', { name: 'Yes, delete Core' }).click()
    expect(await signedWrite(setup.wallet, 'deleteOrgTeam', setup.orgId)).toEqual({ orgId: setup.orgId, teamId: 'team-core' })
  })

  test('a member sees the teams but cannot change them', async ({ page }) => {
    await openManagePage(page, { role: 'MEMBER', section: 'teams', org: { teams: [CORE] } })
    await expect(page.getByRole('list', { name: 'Teams' }).getByText('Core', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create team' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit Core' })).toHaveCount(0)
  })
})

test.describe('manage: settings', () => {
  test('an admin edits the profile and the directory listing, without owner controls', async ({ page }) => {
    const setup = await openManagePage(page, { role: 'ADMIN', section: 'settings', org: { bio: 'Old bio', listed: false } })
    await answer(setup.orgId, 'UpdateOrganization', organization({ id: setup.orgId, handle: 'acme-manage', name: 'Acme Manage Ltd', bio: 'We manage.' }))
    await answer(setup.orgId, 'SetOrgListed', organization({ id: setup.orgId, handle: 'acme-manage', listed: true }))
    await expect(page.getByRole('button', { name: 'Propose handle change' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Propose deleting the organisation' })).toHaveCount(0)

    await page.getByLabel('Name', { exact: true }).fill('Acme Manage Ltd')
    await page.getByLabel('Bio').fill('We manage.')
    await page.getByRole('button', { name: 'Save profile' }).click()
    expect(await signedWrite(setup.wallet, 'updateOrganization', setup.orgId)).toEqual({ orgId: setup.orgId, name: 'Acme Manage Ltd', bio: 'We manage.' })

    await page.getByRole('switch', { name: 'List in the organisation directory' }).click()
    expect(await signedWrite(setup.wallet, 'setOrgListed', setup.orgId)).toEqual({ orgId: setup.orgId, listed: true })
  })

  test('an owner proposes a handle change and deleting the organisation', async ({ page }) => {
    const setup = await openManagePage(page, {
      role: 'OWNER',
      section: 'settings',
      org: { apps: [] },
      answers: { OrgHandleAvailability: (v) => ({ orgHandleAvailability: { handle: v.handle, available: true, reason: null } }) },
    })
    await answer(setup.orgId, 'ProposeOrgChange', orgProposal({ orgId: setup.orgId }))
    await page.getByLabel('New handle').fill('acme-two')
    // Nothing can be proposed while the availability check runs (it waits 400 ms before asking).
    await expect(page.getByRole('button', { name: 'Propose handle change' })).toBeDisabled()
    await expect(page.getByText('renown.id/@acme-two is available.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Propose handle change' })).toBeEnabled()
    await page.getByRole('button', { name: 'Propose handle change' }).click()
    expect(await signedWrite(setup.wallet, 'proposeOrgChange', setup.orgId, (v) => v.kind === 'CHANGE_HANDLE')).toEqual({
      orgId: setup.orgId,
      kind: 'CHANGE_HANDLE',
      payload: { handle: 'acme-two' },
    })

    const remove = page.getByRole('button', { name: 'Propose deleting the organisation' })
    await expect(remove).toBeDisabled()
    await page.getByLabel('Type acme-manage to confirm').fill('acme-manage')
    await remove.click()
    expect(await signedWrite(setup.wallet, 'proposeOrgChange', setup.orgId, (v) => v.kind === 'DELETE_ORG')).toEqual({
      orgId: setup.orgId,
      kind: 'DELETE_ORG',
      payload: {},
    })
  })

  test('a member is told only admins open settings', async ({ page }) => {
    await openManagePage(page, { role: 'MEMBER', section: 'settings' })
    await expect(page.getByText('Only admins and owners can open Settings.')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Organisation settings' }).getByRole('link', { name: 'Settings' })).toHaveCount(0)
  })
})
