import Link from 'next/link'
import { useCallback, useState } from 'react'
import { useNow } from '../../hooks/use-now'
import { useRemote } from '../../hooks/use-remote'
import { manageHref, orgPath, roleLabel } from '../../lib/orgs/format'
import { UNCONFIRMED_CHECKING_TEXT } from '../../lib/orgs/errors'
import { expiryText } from '../../lib/orgs/members'
import { orgWriter, sessionSigner } from '../../services/org-client-write'
import type { OrgMutationName } from '../../services/org-mutations'
import { myOrgInvites, organizationsByMember, withBearer } from '../../services/orgs'
import { OrgAvatar } from '../org/org-avatar'
import { ConfirmButton, RemoteView } from '../org-manage/manage-ui'
import { buttonClasses } from '../site/primitives'
import type { MeSession } from './use-me-session'

type SignedIn = Extract<MeSession, { state: 'signed-in' }>

// The switchboard leaves archived organisations out of organizationsByMember, so every row here is live.
/** /me's organisations: invites waiting for an answer, then every organisation the wallet belongs to. */
export function OrgMemberships({
  session,
  onToast,
}: {
  session: SignedIn
  onToast: (tone: 'success' | 'error', text: string) => void
}) {
  const { address, getBearer } = session
  const loadOrgs = useCallback(
    async () => withBearer(getBearer, (bearer) => organizationsByMember(address, bearer)),
    [address, getBearer],
  )
  const loadInvites = useCallback(
    async () => withBearer(getBearer, (bearer) => myOrgInvites(bearer)),
    [getBearer],
  )
  const orgs = useRemote(`me-orgs:${address.toLowerCase()}`, loadOrgs)
  const invites = useRemote(`me-invites:${address.toLowerCase()}`, loadInvites)
  const now = useNow()
  const [busy, setBusy] = useState<string | null>(null)

  async function act(
    key: string,
    name: OrgMutationName,
    args: Record<string, unknown>,
    success: string,
    after: () => void,
  ) {
    setBusy(key)
    const result = await orgWriter(sessionSigner(session)).write(name, args)
    setBusy(null)
    if (result.ok) {
      onToast('success', success)
      after()
    } else if (result.unconfirmed) {
      // A lost answer may have been applied: re-read before anyone retries.
      onToast('error', UNCONFIRMED_CHECKING_TEXT)
      refresh()
    } else {
      onToast('error', result.message)
    }
  }

  const refresh = () => {
    orgs.reload()
    invites.reload()
  }

  return (
    <section id="organisations" aria-labelledby="organisations-title" className="scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="organisations-title" className="text-ink text-h3">
          Organisations
        </h2>
        <Link
          href="/org/new"
          className="text-primary-ink text-sm font-semibold underline-offset-4 hover:underline"
        >
          Create organisation
        </Link>
      </div>

      {invites.state.status === 'ready' && invites.state.value.length > 0 && (
        <ul aria-label="Pending invites" className="mt-4 space-y-3">
          {invites.state.value.map((invite) => (
            <li
              key={invite.id}
              className="border-primary/30 bg-primary/[0.05] rounded-card flex flex-wrap items-center gap-3 border p-4"
            >
              <OrgAvatar org={invite.org} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="text-ink text-sm font-semibold break-words">
                  {invite.org.name} invited you as {roleLabel(invite.role)}
                </p>
                <p className="text-ink-muted text-xs">{expiryText(invite.expiresAt, now)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === invite.id}
                  onClick={() =>
                    void act(
                      invite.id,
                      'respondToOrgInvite',
                      { orgId: invite.orgId, inviteId: invite.id, accept: true },
                      `You joined ${invite.org.name}.`,
                      refresh,
                    )
                  }
                  className={buttonClasses('primary', 'md')}
                >
                  Join {invite.org.name}
                </button>
                <button
                  type="button"
                  disabled={busy === invite.id}
                  aria-label={`Decline the invite from ${invite.org.name}`}
                  onClick={() =>
                    void act(
                      invite.id,
                      'respondToOrgInvite',
                      { orgId: invite.orgId, inviteId: invite.id, accept: false },
                      'Invite declined.',
                      refresh,
                    )
                  }
                  className={buttonClasses('ghost', 'md')}
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <RemoteView remote={orgs.state} what="organisations" onRetry={orgs.reload}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-ink-muted text-sm">You are not in any organisation yet.</p>
            ) : (
              <ul
                aria-label="Your organisations"
                className="border-hairline bg-surface-1 rounded-card divide-hairline divide-y border"
              >
                {list.map(({ org, role, hidden }) => (
                  <li key={org.id} className="flex flex-wrap items-center gap-3 p-4">
                    <OrgAvatar org={org} className="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={orgPath(org.handle)}
                        className="text-ink block truncate font-semibold hover:underline"
                      >
                        {org.name}
                      </Link>
                      <p className="text-ink-muted text-xs">
                        {roleLabel(role)}
                        {hidden ? ', hidden from public lists' : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={manageHref(org.handle)}
                        className={buttonClasses('secondary', 'md')}
                      >
                        Manage
                      </Link>
                      <button
                        type="button"
                        disabled={busy === org.id}
                        onClick={() =>
                          void act(
                            org.id,
                            'setMyOrgMembershipHidden',
                            { orgId: org.id, hidden: !hidden },
                            hidden
                              ? `You show on ${org.name}’s public lists.`
                              : `You are hidden from ${org.name}’s public lists.`,
                            orgs.reload,
                          )
                        }
                        className={buttonClasses('ghost', 'md')}
                      >
                        {hidden ? 'Show on public lists' : 'Hide from public lists'}
                      </button>
                      <ConfirmButton
                        label={`Leave ${org.name}`}
                        confirm={`Yes, leave ${org.name}`}
                        busy={busy === org.id}
                        onConfirm={() =>
                          void act(
                            org.id,
                            'leaveOrganization',
                            { orgId: org.id },
                            `You left ${org.name}.`,
                            orgs.reload,
                          )
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </RemoteView>
      </div>
    </section>
  )
}
