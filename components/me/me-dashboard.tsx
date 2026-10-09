import { useEffect, useMemo, useState } from 'react'
import { useOwnProfile } from '../../hooks/use-own-profile'
import { profileCompleteness } from '../../lib/me/completeness'
import { identityDid, type Connection, type ConnectionGroup } from '../../lib/me/connections'
import { myDataFileName, myDataJson } from '../../lib/me/export'
import { revokeFailureText } from '../../lib/me/revoke'
import { buttonClasses, Heading, Lead } from '../site/primitives'
import { ToastRegion, useToasts } from '../site/toast'
import { CompletenessChecklist } from './completeness-checklist'
import { ConnectionSection } from './connection-list'
import { IdentityCard } from './identity-card'
import { RevokeDialog, type RevokeTarget } from './revoke-dialog'
import { useConnections } from './use-connections'
import type { MeSession } from './use-me-session'

type SignedIn = Extract<MeSession, { state: 'signed-in' }>

/** "Now", refreshed every minute so relative times and Expired badges stay true. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

function download(name: string, json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ListSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      {[0, 1].map((key) => (
        <div key={key} className="border-hairline bg-surface-1 rounded-panel h-36 border motion-safe:animate-pulse" />
      ))}
    </div>
  )
}

export function MeDashboard({ session }: { session: SignedIn }) {
  const { address } = session
  const { profile, loaded: profileLoaded } = useOwnProfile(address)
  const connections = useConnections(address, session)
  const now = useNow()
  const { toasts, show, dismiss } = useToasts()
  const [target, setTarget] = useState<RevokeTarget | null>(null)
  const completeness = useMemo(() => profileCompleteness(profile), [profile])
  const did = identityDid(address, connections.credentials)

  function askRevoke(group: ConnectionGroup, connection: Connection) {
    setTarget({
      credentialId: connection.credentialId,
      name: group.name,
      sectionId: group.kind === 'app' ? 'apps-title' : 'sessions-title',
    })
  }

  async function confirmRevoke(chosen: RevokeTarget) {
    setTarget(null)
    // The row is about to disappear: keep keyboard focus in the list.
    document.getElementById(chosen.sectionId)?.focus()
    const result = await connections.revoke(chosen.credentialId)
    if (result.ok) show('success', `Revoked. ${chosen.name} can no longer act for you.`)
    else show('error', `${chosen.name} was not revoked. ${revokeFailureText(result.reason)}`)
  }

  const { apps, sessions } = connections.grouped
  return (
    <>
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <Heading level={1}>Your Renown</Heading>
          <Lead className="mt-3">Your identity, your public profile and every app you have allowed to act for you.</Lead>
        </div>
        <button
          type="button"
          // Both reads must have answered, or the file would say "no profile" while it is still loading.
          disabled={connections.status !== 'ready' || !profileLoaded}
          onClick={() =>
            download(myDataFileName(address), myDataJson({ address, did, profile, connections: connections.grouped, now: new Date() }))
          }
          className={buttonClasses('secondary', 'md', 'self-start md:self-auto')}
        >
          Download my data
        </button>
      </div>

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-12">
        <div className="space-y-5 lg:sticky lg:top-24">
          <IdentityCard address={address} did={did} profile={profile} completeness={completeness} />
          <CompletenessChecklist completeness={completeness} />
        </div>

        <div className="min-w-0 space-y-12" aria-busy={connections.status === 'loading'}>
          {connections.status === 'loading' && <ListSkeleton />}
          {connections.status === 'error' && (
            <div role="alert" className="border-hairline-strong rounded-panel border border-dashed px-6 py-10 text-center">
              <h2 className="text-ink text-h3">Your approvals did not load</h2>
              <p className="text-ink-muted mt-2 text-sm">Renown did not answer. Nothing has changed; try again.</p>
              <button type="button" onClick={connections.retry} className={buttonClasses('primary', 'md', 'mt-6')}>
                Try again
              </button>
            </div>
          )}
          {connections.status === 'ready' && (
            <>
              <ConnectionSection
                id="apps-title"
                title="Connected apps"
                description="Apps with a public Renown identity that can sign in and act for you."
                empty="No apps can act for you right now."
                groups={apps}
                now={now}
                onRevoke={askRevoke}
              />
              <ConnectionSection
                id="sessions-title"
                title="CLI & other sessions"
                description="Command-line tools and clients without an app profile, listed by the identity they use."
                empty="No CLI or other sessions."
                groups={sessions}
                now={now}
                onRevoke={askRevoke}
              />
            </>
          )}
        </div>
      </div>

      <RevokeDialog target={target} onCancel={() => setTarget(null)} onConfirm={(t) => void confirmRevoke(t)} />
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </>
  )
}
