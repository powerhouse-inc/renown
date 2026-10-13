// The invite page's "Join" control. It signs with the wallet session, so
// pages/invite/[token].tsx loads it inside the wallet shell.
import { useRouter } from 'next/router'
import { useState } from 'react'
import { manageHref, shortAddress } from '../../lib/orgs/format'
import { INVITE_STATE_TEXT, inviteLinkState } from '../../lib/orgs/invites'
import { ANALYTICS_EVENTS, useOpenPanelAnalytics } from '../../services/analytics'
import { orgWriter, sessionSigner } from '../../services/org-client-write'
import { fetchOrganization, orgInviteLinkPreview, withBearer, type OrgRole, type OrgSummary } from '../../services/orgs'
import { useMeSession, type MeSession } from '../me/use-me-session'
import { buttonClasses } from '../site/primitives'
import { InviteAcceptLoading } from './invite-accept-loading'

type SignedIn = Extract<MeSession, { state: 'signed-in' }>

type JoinState =
  | { status: 'idle' | 'joining' | 'checking' }
  | { status: 'error'; message: string }
  /** The answer was lost: the join may have gone through. Check again before signing anew (writes are not idempotent). */
  | { status: 'uncertain'; message: string }
  /** The link stopped being usable meanwhile. */
  | { status: 'closed'; message: string }

/** After a lost answer: 'joined' when the viewer is now an active member, else whether the link can still be used. Throws when Renown does not answer. */
async function checkJoined(session: SignedIn, token: string, org: OrgSummary): Promise<'joined' | 'usable' | { closed: string }> {
  const current = await withBearer(session.getBearer, (bearer) => fetchOrganization({ id: org.id }, bearer))
  if (current?.viewerMembership?.status === 'ACTIVE') return 'joined'
  const preview = await orgInviteLinkPreview(token)
  const state = preview ? inviteLinkState(preview) : 'revoked'
  return state === 'usable' ? 'usable' : { closed: INVITE_STATE_TEXT[state] }
}

export function InviteAccept({ token, org, role }: { token: string; org: OrgSummary; role: OrgRole }) {
  const session = useMeSession()
  const router = useRouter()
  const { track } = useOpenPanelAnalytics()
  const [state, setState] = useState<JoinState>({ status: 'idle' })

  if (session.state === 'loading') return <InviteAcceptLoading error={null} />
  if (session.state === 'signed-out') {
    return (
      <button type="button" onClick={session.login} className={buttonClasses('primary', 'lg')}>
        Sign in to join
      </button>
    )
  }
  const signedIn = session

  async function joined() {
    track(ANALYTICS_EVENTS.orgInviteAccepted, { role })
    await router.push(manageHref(org.handle))
  }

  async function recheck() {
    setState({ status: 'checking' })
    try {
      const outcome = await checkJoined(signedIn, token, org)
      if (outcome === 'joined') return await joined()
      if (outcome === 'usable') return setState({ status: 'error', message: 'You have not joined yet. Try again.' })
      setState({ status: 'closed', message: outcome.closed })
    } catch {
      setState({ status: 'uncertain', message: 'Renown did not answer, so it is not known whether you joined. Check again in a moment.' })
    }
  }

  async function join() {
    setState({ status: 'joining' })
    const result = await orgWriter(sessionSigner(signedIn)).write('acceptOrgInviteLink', { token })
    if (result.ok) return joined()
    if (result.unconfirmed) return recheck()
    setState({ status: 'error', message: result.message })
  }

  if (state.status === 'closed') {
    return (
      <p role="status" className="text-ink font-semibold">
        {state.message}
      </p>
    )
  }
  const busy = state.status === 'joining' || state.status === 'checking'
  const uncertain = state.status === 'uncertain'
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void (uncertain ? recheck() : join())}
        disabled={busy}
        className={buttonClasses('primary', 'lg')}
      >
        {state.status === 'joining' ? 'Joining…' : state.status === 'checking' ? 'Checking…' : uncertain ? 'Check again' : `Join ${org.name}`}
      </button>
      <p className="text-ink-muted text-xs">
        Signed in as <span className="font-mono">{shortAddress(signedIn.address)}</span>
      </p>
      {(state.status === 'error' || uncertain) && (
        <p role="alert" className="text-danger-ink text-sm">
          {state.message}
        </p>
      )}
    </div>
  )
}
