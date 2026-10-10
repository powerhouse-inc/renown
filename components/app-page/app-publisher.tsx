import Link from 'next/link'
import { identityAccent } from '../../lib/identity-art'
import { profileDisplayName, shortAddress } from '../../lib/profile-identity'
import type { RenownAppProfile } from '../../services/app-profiles'
import type { RenownProfile } from '../../services/switchboard'
import { profilePath } from '../../utils/profile-url'
import { AppLogo } from '../app/app-logo'
import { IdentityArt } from '../identity/identity-art'
import { PageSection } from '../identity/page-section'
import { ProfileAvatar } from '../profile/profile-avatar'

/** The name a publisher is shown under: their profile's name, else the short address. */
export function publisherName(publisher: RenownProfile | null, address: string): string {
  return publisher ? profileDisplayName(publisher) : shortAddress(address)
}

/** Who publishes the app: identity art strip, avatar, name and handle, linking to their profile. */
export function PublisherCard({ publisher, address }: { publisher: RenownProfile | null; address: string }) {
  const name = publisherName(publisher, address)
  const href = publisher ? profilePath(publisher) : `/profile/${address}`
  return (
    <PageSection id="app-publisher" title="Publisher">
      <Link href={href} className="group border-hairline bg-surface-1 rounded-card hover:border-primary/40 block overflow-hidden border transition-colors">
        <IdentityArt seed={address} idPrefix="publisher" width={640} height={120} className="h-16" />
        <span className="relative block px-4 pb-4">
          <span className="bg-background -mt-7 block w-fit rounded-full p-0.5" style={{ boxShadow: `0 0 0 2px ${identityAccent(address)}` }}>
            <ProfileAvatar documentId={publisher?.documentId} avatar={publisher?.avatar} userImage={publisher?.userImage} seed={address} alt="" className="h-12 w-12" />
          </span>
          <span className="text-ink mt-2 block truncate font-semibold group-hover:underline">{name}</span>
          <span className="text-ink-muted block truncate text-sm">{publisher?.handle ? `@${publisher.handle}` : shortAddress(address)}</span>
        </span>
      </Link>
    </PageSection>
  )
}

/** Other apps by the same publisher, as compact rows; nothing when there are none. */
export function MoreByPublisher({ apps, name }: { apps: RenownAppProfile[]; name: string }) {
  if (apps.length === 0) return null
  return (
    <PageSection id="more-by-publisher" title={`More apps by ${name}`}>
      <ul className="space-y-1">
        {apps.map((app) => {
          const appName = app.name || 'Untitled app'
          return (
            <li key={app.appDid}>
              <Link href={`/app/${app.appDid}`} className="hover:bg-surface-2 -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors">
                <AppLogo documentId={app.documentId} logoRef={app.logoRef} legacyLogo={app.logo} name={appName} className="h-10 w-10 rounded-xl text-base shadow-none" />
                <span className="min-w-0">
                  <span className="text-ink block truncate text-sm font-semibold">{appName}</span>
                  {app.tagline && <span className="text-ink-muted block truncate text-xs">{app.tagline}</span>}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </PageSection>
  )
}
