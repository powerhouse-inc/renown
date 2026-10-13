// Manage-page test support: a signed-in test wallet with a role in a fresh
// organisation (reads answered in the browser), and a check that a write
// reached the switchboard signed over exactly its arguments.
import { expect, type Page } from '@playwright/test'
import { verifyMessage, type Hex } from 'viem'
import type { Organization, OrgMember, OrgRole } from '../../services/orgs'
import { orgMessage } from '../../services/org-signed-messages'
import type { InjectedWallet } from './injected-wallet'
import { APP_DID_A, APP_DID_B, membership, organization, orgInvite, orgInviteLink, orgMember, serveOrgReads } from './org-fixtures'
import { stubRequests, type RecordedRequest } from './stub-switchboard-client'
import { signInTestWallet } from './test-session'

export const OWNER = '0x0a000000000000000000000000000000000000a1'
export const BOB = '0x0b000000000000000000000000000000000000b2'
export const CAROL = '0x0c000000000000000000000000000000000000c3'
export const DAVE = '0x0d000000000000000000000000000000000000d4'

export interface ManageSetup {
  wallet: InjectedWallet
  orgId: string
  /** The test wallet, lowercase. */
  me: string
  org: Organization
}

export function defaultMembers(orgId: string, me: string, role: OrgRole): OrgMember[] {
  return [
    orgMember({ orgId, address: me, role, displayName: 'You Tester' }),
    orgMember({ orgId, address: OWNER, role: 'OWNER', displayName: 'Olga Owner' }),
    orgMember({ orgId, address: BOB, role: 'PUBLISHER', displayName: 'Bob Builder', handle: 'bob-builder', teams: ['core'] }),
    orgMember({ orgId, address: CAROL, role: 'MEMBER', displayName: 'Carol Member' }),
  ]
}

type Answer = (variables: Record<string, unknown>) => unknown

export async function openManagePage(
  page: Page,
  options: {
    role: OrgRole
    section: string
    org?: Partial<Organization>
    members?: (orgId: string, me: string) => OrgMember[]
    answers?: Record<string, Answer>
    /** false: do not wait for the organisation's heading (a non-member sees a notice instead). */
    ready?: boolean
  },
): Promise<ManageSetup> {
  const wallet = await signInTestWallet(page, { bearer: 'e2e-org-bearer' })
  const orgId = crypto.randomUUID()
  const me = wallet.address.toLowerCase()
  const org = organization({
    id: orgId,
    did: `did:web:www.renown.id:org:${orgId}`,
    handle: 'acme-manage',
    name: 'Acme Manage',
    apps: [
      { appDid: APP_DID_A, addedAt: '2026-10-02T10:00:00.000Z', frozen: false },
      { appDid: APP_DID_B, addedAt: '2026-10-03T10:00:00.000Z', frozen: false },
    ],
    viewerMembership: membership(orgId, me, options.role),
    ...options.org,
  })
  const members = options.members?.(orgId, me) ?? defaultMembers(orgId, me, options.role)
  await serveOrgReads(page, {
    OrgByRef: () => ({ organization: org }),
    OrgMembers: () => ({ organizationMembers: members }),
    OrgInvites: () => ({ orgInvites: [orgInvite({ id: 'inv-dave', orgId, address: DAVE, role: 'PUBLISHER' })] }),
    OrgInviteLinks: () => ({ orgInviteLinks: [orgInviteLink({ orgId })] }),
    ...options.answers,
  })
  await page.goto(`/org/acme-manage/manage/${options.section}`)
  if (options.ready !== false) await expect(page.getByRole('heading', { level: 1, name: org.name })).toBeVisible({ timeout: 30_000 })
  return { wallet, orgId, me, org }
}

/**
 * The arguments of the `mutation` the switchboard received from this wallet
 * (for `orgId`, and matching `match`), after checking that the wallet personal_signed
 * orgMessage() of exactly those arguments. `auth` is removed.
 */
export async function signedWrite(
  wallet: InjectedWallet,
  mutation: string,
  orgId: string | null,
  match?: (variables: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  const operation = mutation.charAt(0).toUpperCase() + mutation.slice(1)
  const found: { request?: RecordedRequest } = {}
  await expect
    .poll(
      async () => {
        found.request = (await stubRequests(`mutation ${operation}(`)).find(
          (r) =>
            (r.variables.auth as { address?: string } | undefined)?.address?.toLowerCase() === wallet.address.toLowerCase() &&
            (orgId === null || r.variables.orgId === orgId) &&
            (!match || match(r.variables)),
        )
        return found.request !== undefined
      },
      { timeout: 15_000 },
    )
    .toBe(true)
  const { auth, ...args } = found.request!.variables as Record<string, unknown> & { auth: { signature: Hex; timestamp: string } }
  const message = await orgMessage(mutation, orgId, args, auth.timestamp)
  expect(wallet.personalSignRequests).toContain(message)
  expect(await verifyMessage({ address: wallet.address, message, signature: auth.signature })).toBe(true)
  return args
}
