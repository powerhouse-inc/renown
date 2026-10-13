import { useState, type FormEvent } from 'react'
import type { Remote } from '../../hooks/use-remote'
import { useNow } from '../../hooks/use-now'
import { roleLabel, shortAddress } from '../../lib/orgs/format'
import { canRevokeInvite, expiryText, inviteRoles, parseInvitee } from '../../lib/orgs/members'
import { ANALYTICS_EVENTS, useOpenPanelAnalytics } from '../../services/analytics'
import type { OrgInvite, OrgRole } from '../../services/orgs'
import { Field, inputClass } from '../profile-edit/field'
import { buttonClasses } from '../site/primitives'
import type { ManageContext } from './manage-context'
import { Panel, RemoteView } from './manage-ui'

export function InvitePanel({
  ctx,
  invites,
  onChange,
}: {
  ctx: ManageContext
  invites: Remote<OrgInvite[]>
  onChange: () => void
}) {
  const { track } = useOpenPanelAnalytics()
  const roles = inviteRoles(ctx.role)
  const now = useNow()
  const [text, setText] = useState('')
  const [role, setRole] = useState<OrgRole>('MEMBER')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function invite(event: FormEvent) {
    event.preventDefault()
    const parsed = parseInvitee(text)
    if ('problem' in parsed) {
      setProblem(parsed.problem)
      return
    }
    setProblem(null)
    setBusy('invite')
    const done = await ctx.run<OrgInvite>(
      'inviteOrgMember',
      { orgId: ctx.org.id, invitee: parsed.invitee, role },
      `Invite sent to ${parsed.invitee}.`,
      { recheck: onChange },
    )
    setBusy(null)
    if (done) {
      setText('')
      track(ANALYTICS_EVENTS.orgInviteSent, { role })
      onChange()
    }
  }

  async function revoke(item: OrgInvite) {
    setBusy(item.id)
    const done = await ctx.run<OrgInvite>(
      'revokeOrgInvite',
      { orgId: ctx.org.id, inviteId: item.id },
      'Invite revoked.',
      { recheck: onChange },
    )
    setBusy(null)
    if (done) onChange()
  }

  return (
    <Panel
      id="invite-title"
      title="Invite people"
      description="Invite a wallet address or a Renown handle. They join when they accept; invites expire after 14 days."
    >
      <form
        onSubmit={(event) => void invite(event)}
        noValidate
        className="flex flex-col gap-3 md:flex-row md:items-start"
      >
        <div className="min-w-0 flex-1">
          <Field id="invite-invitee" label="Address or handle" error={problem ?? undefined}>
            <input
              id="invite-invitee"
              className={inputClass}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setProblem(null)
              }}
              placeholder="0x… or handle"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </div>
        <div className="md:w-44">
          <Field id="invite-role" label="Role">
            <select
              id="invite-role"
              className={inputClass}
              value={role}
              onChange={(e) => setRole(e.target.value as OrgRole)}
            >
              {roles.map((option) => (
                <option key={option} value={option}>
                  {roleLabel(option)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button
          type="submit"
          disabled={busy === 'invite'}
          className={buttonClasses('primary', 'md', 'md:mt-[1.625rem]')}
        >
          {busy === 'invite' ? 'Sending…' : 'Send invite'}
        </button>
      </form>
      <h4 className="text-ink mt-6 text-sm font-semibold">Pending invites</h4>
      <div className="mt-2">
        <RemoteView remote={invites} what="pending invites" onRetry={onChange}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-ink-muted text-sm">No pending invites.</p>
            ) : (
              <ul aria-label="Pending invites" className="divide-hairline divide-y">
                {list.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-ink truncate font-mono text-sm">{item.address}</p>
                      <p className="text-ink-muted text-xs">
                        {roleLabel(item.role)}, {expiryText(item.expiresAt, now).toLowerCase()}
                      </p>
                    </div>
                    {canRevokeInvite(ctx.role, item.role) && item.status === 'INVITED' && (
                      <button
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => void revoke(item)}
                        aria-label={`Revoke the invite for ${shortAddress(item.address)}`}
                        className={buttonClasses('ghost', 'md')}
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )
          }
        </RemoteView>
      </div>
    </Panel>
  )
}
