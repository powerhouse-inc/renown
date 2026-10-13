import { useState, type FormEvent } from 'react'
import type { Remote } from '../../hooks/use-remote'
import { useNow } from '../../hooks/use-now'
import { inviteLinkUrl, plural, roleLabel } from '../../lib/orgs/format'
import {
  expiryText,
  LINK_EXPIRY_DAYS,
  LINK_ROLES,
  linkExpiresAt,
  linkUsesProblem,
} from '../../lib/orgs/members'
import type { OrgInviteLink, OrgInviteLinkCreated, OrgRole } from '../../services/orgs'
import { Field, inputClass } from '../profile-edit/field'
import { buttonClasses } from '../site/primitives'
import type { ManageContext } from './manage-context'
import { Panel, RemoteView } from './manage-ui'

export function InviteLinksPanel({
  ctx,
  links,
  reading,
  onChange,
}: {
  ctx: ManageContext
  links: Remote<OrgInviteLink[]>
  /** The list is being (re-)read: creating waits for it, so a lost answer is checked before a retry. */
  reading: boolean
  onChange: () => void
}) {
  const now = useNow()
  const [role, setRole] = useState<OrgRole>('MEMBER')
  const [uses, setUses] = useState('10')
  const [days, setDays] = useState<number>(7)
  /** The new link, shown once, with the id of the link it belongs to. */
  const [created, setCreated] = useState<{ id: string; url: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const usesProblem = linkUsesProblem(uses)

  async function create(event: FormEvent) {
    event.preventDefault()
    if (usesProblem) return
    setBusy('create')
    const done = await ctx.run<OrgInviteLinkCreated>(
      'createOrgInviteLink',
      {
        orgId: ctx.org.id,
        role,
        maxUses: Number(uses),
        expiresAt: linkExpiresAt(days, new Date()),
      },
      'Invite link created.',
      // A lost answer may still have created a link (its token is gone either
      // way): re-read the list before anyone creates another.
      { recheck: onChange },
    )
    setBusy(null)
    if (done) {
      setCreated({ id: done.link.id, url: inviteLinkUrl(window.location.origin, done.token) })
      setCopied(false)
      onChange()
    }
  }

  async function revoke(link: OrgInviteLink) {
    setBusy(link.id)
    const done = await ctx.run<OrgInviteLink>(
      'revokeOrgInviteLink',
      { orgId: ctx.org.id, linkId: link.id },
      'Invite link revoked.',
      { recheck: onChange },
    )
    setBusy(null)
    if (done) {
      // The one-time panel must not offer a dead link.
      if (created?.id === link.id) setCreated(null)
      onChange()
    }
  }

  return (
    <Panel
      id="links-title"
      title="Invite links"
      description="Anyone with the link can join with the role you choose, until it expires or runs out of uses."
    >
      <form
        onSubmit={(event) => void create(event)}
        noValidate
        className="grid gap-3 sm:grid-cols-3"
      >
        <Field id="link-role" label="Role">
          <select
            id="link-role"
            className={inputClass}
            value={role}
            onChange={(e) => setRole(e.target.value as OrgRole)}
          >
            {LINK_ROLES.map((option) => (
              <option key={option} value={option}>
                {roleLabel(option)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="link-uses" label="Uses" error={usesProblem ?? undefined}>
          <input
            id="link-uses"
            type="number"
            min={1}
            max={100}
            inputMode="numeric"
            className={inputClass}
            value={uses}
            onChange={(e) => setUses(e.target.value)}
          />
        </Field>
        <Field id="link-expiry" label="Expires after">
          <select
            id="link-expiry"
            className={inputClass}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {LINK_EXPIRY_DAYS.map((option) => (
              <option key={option} value={option}>
                {plural(option, 'day', 'days')}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="submit"
          disabled={busy === 'create' || reading}
          className={buttonClasses('primary', 'md', 'justify-self-start sm:col-span-3')}
        >
          {busy === 'create' ? 'Creating…' : reading ? 'Checking the links…' : 'Create invite link'}
        </button>
      </form>
      {created && (
        <div
          role="region"
          aria-label="New invite link"
          className="border-primary/30 bg-primary/[0.05] rounded-card mt-5 border p-4"
        >
          <p className="text-ink text-sm font-semibold">
            Copy the link now: Renown shows it only once.
          </p>
          <p className="text-ink mt-2 font-mono text-[13px] break-all">{created.url}</p>
          <button
            type="button"
            onClick={() => {
              Promise.resolve()
                .then(() => navigator.clipboard.writeText(created.url))
                .then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
            }}
            className={buttonClasses('secondary', 'md', 'mt-3')}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}
      <div className="mt-6">
        <RemoteView remote={links} what="invite links" onRetry={onChange}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-ink-muted text-sm">No invite links yet.</p>
            ) : (
              <ul aria-label="Invite links" className="divide-hairline divide-y">
                {list.map((link) => {
                  const live =
                    !link.revoked &&
                    Date.parse(link.expiresAt) > now.getTime() &&
                    link.uses < link.maxUses
                  return (
                    <li
                      key={link.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <p className="text-ink text-sm">
                        {roleLabel(link.role)}, {link.uses} of {link.maxUses} used,{' '}
                        <span className="text-ink-muted">
                          {link.revoked ? 'revoked' : expiryText(link.expiresAt, now).toLowerCase()}
                        </span>
                      </p>
                      {live && (
                        <button
                          type="button"
                          disabled={busy === link.id}
                          onClick={() => void revoke(link)}
                          className={buttonClasses('ghost', 'md')}
                        >
                          Revoke link
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )
          }
        </RemoteView>
      </div>
    </Panel>
  )
}
