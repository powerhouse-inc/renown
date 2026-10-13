import { useState } from 'react'
import type { Remote } from '../../hooks/use-remote'
import { memberLabel, roleLabel } from '../../lib/orgs/format'
import { assignableRoles, canRemove } from '../../lib/orgs/members'
import { roleAtLeast } from '../../services/org-signed-messages'
import type { OrgMember, OrgRole } from '../../services/orgs'
import { cx } from '../../utils/cx'
import { inputClass } from '../profile-edit/field'
import { ProfileAvatar } from '../profile/profile-avatar'
import { Badge, buttonClasses } from '../site/primitives'
import type { ManageContext } from './manage-context'
import { ConfirmButton, Panel, RemoteView } from './manage-ui'
import { ScopeEditor } from './scope-editor'

export function MemberList({
  ctx,
  members,
  onChange,
}: {
  ctx: ManageContext
  members: Remote<OrgMember[]>
  onChange: () => void
}) {
  const admin = roleAtLeast(ctx.role, 'ADMIN')
  const [busy, setBusy] = useState<string | null>(null)
  const [scopeFor, setScopeFor] = useState<string | null>(null)

  async function changeRole(member: OrgMember, role: OrgRole) {
    setBusy(member.id)
    const done = await ctx.run(
      'setOrgMemberRole',
      { orgId: ctx.org.id, address: member.address, role },
      `${memberLabel(member)} is now ${roleLabel(role)}.`,
      { recheck: onChange },
    )
    setBusy(null)
    // Re-read the member: the served appScope is the effective one, so after an
    // admin becomes a publisher the stored (often narrower) scope shows again.
    if (done) {
      setScopeFor(null)
      onChange()
    }
  }

  async function remove(member: OrgMember) {
    setBusy(member.id)
    const done = await ctx.run(
      'removeOrgMember',
      { orgId: ctx.org.id, address: member.address },
      `${memberLabel(member)} was removed.`,
      { recheck: onChange },
    )
    setBusy(null)
    if (done) onChange()
  }

  return (
    <Panel
      id="members-title"
      title="Members"
      description={
        admin
          ? 'Owners are added and removed through proposals under Security.'
          : 'Everyone who belongs to the organisation.'
      }
    >
      <RemoteView remote={members} what="members" onRetry={onChange}>
        {(list) => (
          <ul aria-label="Members" className="divide-hairline divide-y">
            {list
              .filter((member) => member.status === 'ACTIVE')
              .map((member) => {
                const you = member.address === ctx.address
                const roles = admin && !you ? assignableRoles(ctx.role, member.role) : []
                const label = memberLabel(member)
                return (
                  <li key={member.id} className="py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <ProfileAvatar seed={member.address} alt="" className="h-10 w-10" />
                      <div className="min-w-0 flex-1">
                        <p className="text-ink truncate font-semibold">
                          {label}
                          {you && <span className="text-ink-muted font-normal"> (you)</span>}
                        </p>
                        <p className="text-ink-muted truncate font-mono text-xs">
                          {member.address}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {member.hidden && <Badge>Hidden from the public list</Badge>}
                        {roles.length > 0 ? (
                          <>
                            <label htmlFor={`role-${member.id}`} className="sr-only">
                              Role of {label}
                            </label>
                            <select
                              id={`role-${member.id}`}
                              value={member.role}
                              disabled={busy === member.id}
                              onChange={(e) => void changeRole(member, e.target.value as OrgRole)}
                              className={cx(inputClass, 'w-auto')}
                            >
                              {roles.map((option) => (
                                <option key={option} value={option}>
                                  {roleLabel(option)}
                                </option>
                              ))}
                            </select>
                          </>
                        ) : (
                          <Badge tone={member.role === 'OWNER' ? 'primary' : 'neutral'}>
                            {roleLabel(member.role)}
                          </Badge>
                        )}
                        {admin && member.role === 'PUBLISHER' && (
                          <button
                            type="button"
                            aria-expanded={scopeFor === member.id}
                            onClick={() => setScopeFor(scopeFor === member.id ? null : member.id)}
                            className={buttonClasses('ghost', 'md')}
                          >
                            App access
                          </button>
                        )}
                        {admin && !you && canRemove(ctx.role, member.role) && (
                          <ConfirmButton
                            label={`Remove ${label}`}
                            confirm={`Yes, remove ${label}`}
                            busy={busy === member.id}
                            onConfirm={() => void remove(member)}
                          />
                        )}
                      </div>
                    </div>
                    {member.teams.length > 0 && (
                      <p className="text-ink-muted mt-2 text-xs">
                        Teams: {member.teams.join(', ')}
                      </p>
                    )}
                    {scopeFor === member.id && (
                      <ScopeEditor
                        key={`${member.role}:${member.appScope.all}:${member.appScope.appDids.join(',')}`}
                        ctx={ctx}
                        member={member}
                        onSaved={() => {
                          setScopeFor(null)
                          onChange()
                        }}
                      />
                    )}
                  </li>
                )
              })}
          </ul>
        )}
      </RemoteView>
    </Panel>
  )
}
