import Link from 'next/link'
import type { IdentityArtSvgs } from '../../lib/identity-art'
import type { QrCode } from '../../lib/qr'
import type { RenownAppProfile } from '../../services/app-profiles'
import { ButtonLink } from '../site/primitives'
import { AppLogo } from '../app/app-logo'
import { ShareMenu } from '../identity/share-menu'
import { VerifiedBadge } from '../identity/verified-badge'
import { AppHeroCover } from './app-hero-cover'

export interface AppHeroProps {
  app: RenownAppProfile
  name: string
  /** The app DID's identity art (server computed), behind the cover. */
  art: IdentityArtSvgs
  /** http(s) website and its hostname, when the app has one. */
  website: { url: string; host: string } | null
  shareUrl: string
  qr: QrCode | null
}

/** The top of an app page: cover (or identity art), logo, name, tagline, category, verification and actions. */
export function AppHero({ app, name, art, website, shareUrl, qr }: AppHeroProps) {
  return (
    <header>
      {/* Keyed by app: a client-side hop to another app must not inherit a failed-cover state. */}
      <AppHeroCover key={app.appDid} documentId={app.documentId} coverRef={app.coverRef} art={art} className="h-[168px] sm:h-[232px] lg:h-[272px]" />
      <div className="px-1 sm:px-8">
        <div className="bg-background relative -mt-12 w-fit rounded-[22px] p-1 sm:-mt-14">
          <AppLogo
            documentId={app.documentId}
            logoRef={app.logoRef}
            legacyLogo={app.logo}
            name={name}
            priority
            className="h-[88px] w-[88px] rounded-[18px] text-4xl shadow-none sm:h-[104px] sm:w-[104px]"
          />
        </div>
        <div className="mt-4 min-w-0">
          <h1 className="text-ink text-h1 text-balance [overflow-wrap:anywhere]">{name}</h1>
          {app.tagline && <p className="text-ink-muted text-lead mt-3 max-w-[60ch] text-pretty [overflow-wrap:anywhere]">{app.tagline}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {app.category && (
              <Link
                href={`/apps?category=${encodeURIComponent(app.category)}`}
                className="border-primary/20 bg-primary/10 text-primary-ink hover:border-primary/50 inline-flex h-7 max-w-full items-center rounded-full border px-3 text-xs font-semibold transition-colors"
              >
                <span className="truncate">{app.category}</span>
              </Link>
            )}
            <VerifiedBadge label="Verified app identity" learnMore={{ href: '/developers', label: 'How apps prove who they are' }}>
              <p>
                This app has its own key, identified by the DID on this page. Only the holder of that key can sign as this app.
                Signing in is separate: your wallet signs a credential naming a key the app creates on your device, and you can
                revoke that credential at any time.
              </p>
            </VerifiedBadge>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
            {website && (
              <ButtonLink href={website.url} rel="noopener noreferrer nofollow">
                Open app
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M7 17 17 7M8 7h9v9" />
                </svg>
              </ButtonLink>
            )}
            <ShareMenu url={shareUrl} title={`${name} on Renown`} qr={qr} subject="this app" align="start" />
            {website && <span className="text-ink-muted text-sm">{website.host}</span>}
          </div>
        </div>
      </div>
    </header>
  )
}
