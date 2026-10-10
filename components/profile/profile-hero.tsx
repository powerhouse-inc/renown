import type { ReactNode } from 'react'
import type { Completeness } from '../../lib/me/completeness'
import { identityAccent } from '../../lib/identity-art'
import { shortAddress } from '../../lib/profile-identity'
import type { QrCode } from '../../lib/qr'
import type { RenownProfile } from '../../services/switchboard'
import { Badge } from '../site/primitives'
import { IdentityArt } from '../identity/identity-art'
import { ShareMenu } from '../identity/share-menu'
import { VerifiedBadge } from '../identity/verified-badge'
import { ProfileAvatar } from './profile-avatar'
import { ProfileOwnerActions } from './profile-owner-actions'

export interface ProfileFact {
  key: string
  icon: 'calendar' | 'apps' | 'activity'
  text: string
}

export interface ProfileHeroProps {
  profile: RenownProfile
  name: string
  /** Lowercase wallet address; null for a profile without one (then no art seed but the document id). */
  address: string | null
  /** The ENS name to show next to the handle (resolves to the address and differs from the name). */
  ensName: string | null
  facts: ProfileFact[]
  completeness: Completeness
  shareUrl: string
  qr: QrCode | null
}

const FACT_ICON: Record<ProfileFact['icon'], ReactNode> = {
  calendar: <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
  apps: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
}

/** The top of a public profile: identity art, avatar, name, handle, verification, facts and actions. */
export function ProfileHero({ profile, name, address, ensName, facts, completeness, shareUrl, qr }: ProfileHeroProps) {
  const seed = address ?? profile.documentId
  return (
    <header>
      <IdentityArt
        seed={seed}
        idPrefix="profile"
        className="border-hairline rounded-panel h-[168px] border sm:h-[232px] lg:h-[272px]"
      />
      <div className="px-1 sm:px-8">
        <div className="-mt-14 flex items-end justify-between gap-4 sm:-mt-[68px]">
          <div className="bg-background relative shrink-0 rounded-full p-1" style={{ boxShadow: `0 0 0 2px ${identityAccent(seed)}` }}>
            <ProfileAvatar
              documentId={profile.documentId}
              avatar={profile.avatar}
              userImage={profile.userImage}
              seed={seed}
              alt={name}
              className="h-[104px] w-[104px] sm:h-[128px] sm:w-[128px]"
            />
          </div>
        </div>
        <div className="mt-4 min-w-0">
          <h1 className="text-ink text-h1 text-balance [overflow-wrap:anywhere]">{name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {profile.handle && <p className="text-primary-ink text-lg font-medium [overflow-wrap:anywhere]">@{profile.handle}</p>}
            {ensName && (
              <Badge tone="neutral" className="max-w-full">
                <span className="truncate">{ensName}</span>
              </Badge>
            )}
            {address && (
              <VerifiedBadge label="Verified Renown identity" learnMore={{ href: '/trust', label: 'How Renown verifies identities' }}>
                <p>
                  The wallet {shortAddress(address)} controls this identity. Only that wallet, or an app it has approved, can change
                  this profile, and every change is signed.
                </p>
              </VerifiedBadge>
            )}
          </div>
          {facts.length > 0 && (
            <ul className="text-ink-muted mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="About this profile">
              {facts.map((fact) => (
                <li key={fact.key} className="inline-flex items-center gap-2">
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {FACT_ICON[fact.icon]}
                  </svg>
                  {fact.text}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <ShareMenu url={shareUrl} title={`${name} on Renown`} qr={qr} subject="this profile" align="start" />
            {address && <ProfileOwnerActions address={address} completeness={completeness} />}
          </div>
        </div>
      </div>
    </header>
  )
}
