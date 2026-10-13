import Link from 'next/link'
import { orgPath } from '../../lib/orgs/format'
import { formatInstant } from '../../lib/verify/format'
import type { AppParty, ReportTime, SignerParty } from '../../lib/verify/types'
import { identityAccent } from '../../lib/identity-art'
import { profilePath } from '../../utils/profile-url'
import { AppLogo } from '../app/app-logo'
import { ProfileAvatar } from '../profile/profile-avatar'

const panel = 'border-hairline bg-surface-1 rounded-card border p-5'
const caption = 'text-ink-muted text-xs font-medium'
const mono = 'text-ink font-mono text-[13px] leading-5 break-all'

function ArrowIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  )
}

/** Who signed: the profile when there is one (linking to it), always the address. */
export function SignerCard({ signer, heading }: { signer: SignerParty; heading: string }) {
  const p = signer.profile
  const name = p?.displayName?.trim() || (p?.handle ? `@${p.handle}` : null)
  return (
    <section aria-label={heading} className={panel}>
      <p className={caption}>{heading}</p>
      <div className="mt-3 flex items-center gap-3">
        <span className="shrink-0 rounded-full p-[2px]" style={{ background: identityAccent(signer.address) }}>
          <ProfileAvatar documentId={p?.documentId} avatar={p?.avatar} seed={signer.address} alt="" className="ring-background h-11 w-11 ring-2" />
        </span>
        <div className="min-w-0">
          {p ? (
            <Link href={profilePath(p)} className="text-ink hover:text-primary-ink inline-flex items-center gap-1 font-semibold">
              <span className="truncate">{name ?? 'Renown profile'}</span>
              <ArrowIcon />
            </Link>
          ) : (
            <p className="text-ink font-semibold">{signer.looked ? 'No public profile' : 'Profile not checked'}</p>
          )}
          {p?.handle && name !== `@${p.handle}` && <p className="text-ink-muted truncate text-sm">@{p.handle}</p>}
        </div>
      </div>
      <p className={`${caption} mt-4`}>Wallet</p>
      <p className={mono}>{signer.address}</p>
    </section>
  )
}

/** For which app: its public profile (linking to it), the name it signs with, its key. */
export function AppCard({ app }: { app: AppParty }) {
  if (app.session) {
    return (
      <section aria-label="App" className={panel}>
        <p className={caption}>App</p>
        <p className="text-ink mt-3 font-semibold">A CLI or other session</p>
        <p className="text-ink-muted mt-1 text-sm leading-6">The wallet authorised a session of its own, not an app with a separate key.</p>
      </section>
    )
  }
  const name = app.profile?.name?.trim() || app.claimedName?.trim() || 'Unnamed app'
  return (
    <section aria-label="App" className={panel}>
      <p className={caption}>App</p>
      <div className="mt-3 flex items-center gap-3">
        <AppLogo documentId={app.profile?.documentId ?? ''} logoRef={app.profile?.logoRef} name={name} className="h-11 w-11 text-base ring-0" />
        <div className="min-w-0">
          {app.profile ? (
            <Link href={`/app/${app.did}`} className="text-ink hover:text-primary-ink inline-flex items-center gap-1 font-semibold">
              <span className="truncate">{name}</span>
              <ArrowIcon />
            </Link>
          ) : (
            <p className="text-ink truncate font-semibold">{name}</p>
          )}
          <p className="text-ink-muted text-sm">
            {app.profile ? 'Public app profile' : app.looked ? 'No public app profile' : 'App profile not checked'}
          </p>
          {app.publisherOrg && (
            <p className="text-ink-muted text-sm">
              Published by{' '}
              <Link href={orgPath(app.publisherOrg.handle)} className="text-ink font-semibold hover:underline">
                {app.publisherOrg.name}
              </Link>
              {app.publisherOrg.verifiedDomains[0] ? `, verified as ${app.publisherOrg.verifiedDomains[0]}` : ''}
            </p>
          )}
        </div>
      </div>
      <p className={`${caption} mt-4`}>App key</p>
      <p className={mono}>{app.did}</p>
    </section>
  )
}

export function Times({ times }: { times: ReportTime[] }) {
  if (times.length === 0) return null
  return (
    <section aria-label="Dates" className={panel}>
      <dl className="space-y-3">
        {times.map((time) => (
          <div key={time.label}>
            <dt className={caption}>{time.label}</dt>
            <dd className="text-ink text-sm">
              <time dateTime={time.iso}>{formatInstant(time.iso)}</time>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
