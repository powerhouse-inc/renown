import Link from 'next/link'
import { identityAccent } from '../../lib/identity-art'
import { orgPath, plural } from '../../lib/orgs/format'
import type { OrgCard } from '../../services/orgs'
import { markdownPlainText } from '../../utils/markdown-lite'
import { OrgAvatar } from '../org/org-avatar'
import { OrgVerification } from '../org/org-verification'
import { Badge } from '../site/primitives'

/** A directory entry: avatar, name, handle, verification, member count and the start of the bio. */
export function OrgCardView({ org }: { org: OrgCard }) {
  const accent = identityAccent(org.id)
  const bio = org.bio ? markdownPlainText(org.bio, 140) : ''
  return (
    <Link
      href={orgPath(org.handle)}
      data-org-id={org.id}
      className="group border-hairline bg-surface-1 shadow-card rounded-card hover:border-primary/40 relative flex h-full flex-col overflow-hidden border p-5 transition-[border-color,box-shadow] duration-300"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-80"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="flex items-center gap-4">
        <span className="shrink-0 rounded-full p-[2px]" style={{ background: accent }}>
          <OrgAvatar org={org} className="ring-background h-14 w-14 ring-2" />
        </span>
        <div className="min-w-0">
          <h2 className="text-ink truncate text-[17px] leading-6 font-semibold group-hover:underline group-hover:underline-offset-4">
            {org.name}
          </h2>
          <p className="text-ink-muted truncate text-sm">@{org.handle}</p>
        </div>
      </div>
      <div className="mt-4 flex min-w-0 flex-wrap gap-2">
        <OrgVerification verifiedDomains={org.verifiedDomains.slice(0, 1)} />
        <Badge>{plural(org.memberCount, 'member', 'members')}</Badge>
      </div>
      {org.notAffiliatedWith && (
        <p className="text-caution-ink mt-3 text-sm leading-6">
          Not affiliated with the verified {org.notAffiliatedWith.name}
        </p>
      )}
      {bio && <p className="text-ink-muted mt-3 line-clamp-2 text-sm leading-6">{bio}</p>}
    </Link>
  )
}
