import { useCallback } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { roleAtLeast } from '../../services/org-signed-messages'
import { organizationMembers, orgInviteLinks, orgInvites, withBearer } from '../../services/orgs'
import { InviteLinksPanel } from './invite-links-panel'
import { InvitePanel } from './invite-panel'
import type { ManageSectionProps } from './manage-context'
import { MemberList } from './member-list'

/** Invites and invite links (admins and owners), then the members. */
export function MembersSection({ ctx }: ManageSectionProps) {
  const { org, getBearer } = ctx
  const admin = roleAtLeast(ctx.role, 'ADMIN')
  const loadMembers = useCallback(
    () => withBearer(getBearer, (bearer) => organizationMembers(org.id, false, bearer)),
    [org.id, getBearer],
  )
  const loadInvites = useCallback(
    () => withBearer(getBearer, (bearer) => orgInvites(org.id, bearer)),
    [org.id, getBearer],
  )
  const loadLinks = useCallback(
    () => withBearer(getBearer, (bearer) => orgInviteLinks(org.id, bearer)),
    [org.id, getBearer],
  )
  const members = useRemote(`members:${org.id}`, loadMembers)
  const invites = useRemote(admin ? `invites:${org.id}` : null, loadInvites)
  const links = useRemote(admin ? `links:${org.id}` : null, loadLinks)
  return (
    <div className="mt-6 space-y-8">
      {admin && <InvitePanel ctx={ctx} invites={invites.state} onChange={invites.reload} />}
      {admin && (
        <InviteLinksPanel
          ctx={ctx}
          links={links.state}
          reading={links.pending}
          onChange={links.reload}
        />
      )}
      <MemberList ctx={ctx} members={members.state} onChange={members.reload} />
    </div>
  )
}
