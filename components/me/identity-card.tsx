import type { ReactNode } from 'react'
import type { Completeness } from '../../lib/me/completeness'
import type { RenownProfile } from '../../services/switchboard'
import { profilePath } from '../../utils/profile-url'
import { shortAddress } from '../site/account-links'
import { ButtonLink } from '../site/primitives'
import { ProfileAvatar } from '../profile/profile-avatar'
import { CopyField } from './copy-field'

const RING = { size: 132, stroke: 4 }

/**
 * The avatar inside a ring that fills as the profile is completed: the one
 * place on /me where the identity itself is the picture.
 */
function CompletenessRing({ percent, children }: { percent: number; children: ReactNode }) {
  const r = (RING.size - RING.stroke) / 2
  return (
    <div className="relative grid h-[132px] w-[132px] shrink-0 place-items-center">
      <svg aria-hidden="true" viewBox={`0 0 ${RING.size} ${RING.size}`} className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id="me-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--grad-from)' }} />
            <stop offset="1" style={{ stopColor: 'var(--grad-to)' }} />
          </linearGradient>
        </defs>
        <circle cx={RING.size / 2} cy={RING.size / 2} r={r} fill="none" strokeWidth={RING.stroke} style={{ stroke: 'var(--hairline-strong)' }} />
        {percent > 0 && (
          <circle
            cx={RING.size / 2}
            cy={RING.size / 2}
            r={r}
            fill="none"
            stroke="url(#me-ring)"
            strokeWidth={RING.stroke}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${percent} 100`}
            className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-700"
          />
        )}
      </svg>
      {children}
    </div>
  )
}

export function IdentityCard({
  address,
  did,
  profile,
  completeness,
}: {
  address: string
  did: string
  profile: RenownProfile | null
  completeness: Completeness
}) {
  const name = profile?.displayName || profile?.username || shortAddress(address)
  const publicHref = profile ? profilePath(profile) : `/profile/${address}`
  return (
    <section aria-labelledby="identity-name" className="border-hairline bg-surface-1 shadow-card rounded-panel border p-6">
      <div className="flex items-center gap-5">
        <CompletenessRing percent={completeness.percent}>
          <ProfileAvatar
            documentId={profile?.documentId}
            avatar={profile?.avatar}
            userImage={profile?.userImage}
            seed={address.toLowerCase()}
            alt=""
            className="h-[108px] w-[108px]"
          />
        </CompletenessRing>
        <div className="min-w-0">
          <h2 id="identity-name" className="text-ink text-h3 truncate">
            {name}
          </h2>
          <p className="text-ink-muted mt-1 truncate text-sm">{profile?.handle ? `@${profile.handle}` : 'No handle yet'}</p>
        </div>
      </div>
      <div className="mt-6">
        <CopyField label="DID" value={did} />
        <CopyField label="Address" value={address} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <ButtonLink href={publicHref} variant="secondary">
          View public profile
        </ButtonLink>
        <ButtonLink href="/profile/edit" variant="ghost">
          Edit profile
        </ButtonLink>
      </div>
    </section>
  )
}
