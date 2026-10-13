import Link from 'next/link'
import { orgPath, roleLabel } from '../../lib/orgs/format'
import { formatDay } from '../../lib/verify/format'
import type { OrgRole, OrgSummary } from '../../services/orgs'
import { PageSection } from '../identity/page-section'
import { OrgAvatar } from '../org/org-avatar'
import { NotAffiliatedNote, OrgVerification } from '../org/org-verification'

export interface ReleaseSignOff {
  version: string
  issuedAt: string
  signerName: string
  signerHref: string
  signerRole: OrgRole | null
  stillMember: boolean
}

/** The organisation that publishes the app, and who signed off its latest release. */
export function OrgPublisherCard({
  org,
  signOff,
  notAffiliatedWith = null,
}: {
  org: OrgSummary
  signOff: ReleaseSignOff | null
  notAffiliatedWith?: OrgSummary | null
}) {
  return (
    <PageSection id="app-publisher" title="Publisher">
      <div className="border-hairline bg-surface-1 rounded-card border p-4">
        <Link href={orgPath(org.handle)} className="group flex items-center gap-3">
          <OrgAvatar org={org} className="h-12 w-12" />
          <span className="min-w-0">
            <span className="text-ink block truncate font-semibold group-hover:underline">
              {org.name}
            </span>
            <span className="text-ink-muted block truncate text-sm">@{org.handle}</span>
          </span>
        </Link>
        <div className="mt-3 flex flex-wrap gap-2">
          <OrgVerification verifiedDomains={org.verifiedDomains} />
        </div>
        {notAffiliatedWith && (
          <div className="mt-3">
            <NotAffiliatedNote other={notAffiliatedWith} />
          </div>
        )}
        {signOff && (
          <p className="text-ink-muted mt-3 text-sm leading-6">
            Release {signOff.version} signed off by{' '}
            <Link href={signOff.signerHref} className="text-ink font-semibold hover:underline">
              {signOff.signerName}
            </Link>
            {signOff.signerRole && signOff.stillMember ? ` (${roleLabel(signOff.signerRole)})` : ''}{' '}
            on {formatDay(signOff.issuedAt)}.
            {signOff.stillMember
              ? ''
              : ` They${signOff.signerRole ? ` were ${/^[AEIOU]/.test(roleLabel(signOff.signerRole)) ? 'an' : 'a'} ${roleLabel(signOff.signerRole)} when signing and` : ''} are no longer a member.`}
          </p>
        )}
      </div>
    </PageSection>
  )
}
