import Link from 'next/link'
import { orgPath, roleLabel } from '../../lib/orgs/format'
import type { OrgAffiliation } from '../../services/orgs'
import { PageSection } from '../identity/page-section'
import { OrgAvatar } from '../org/org-avatar'

/**
 * The organisations a person is a public member of (archived ones left out); nothing when there
 * are none, and a "couldn't load" line when they could not be read (null).
 */
export function MemberOf({ orgs }: { orgs: OrgAffiliation[] | null }) {
  if (orgs === null) {
    return (
      <PageSection id="member-of" title="Member of">
        <p className="text-ink-muted text-sm">We couldn’t load this person’s organisations right now.</p>
      </PageSection>
    )
  }
  // A harmless guard: the switchboard already leaves archived organisations out.
  const shown = orgs.filter((affiliation) => !affiliation.org.archived)
  if (shown.length === 0) return null
  return (
    <PageSection id="member-of" title="Member of">
      <ul className="flex flex-wrap gap-2">
        {shown.map(({ org, role }) => (
          <li key={org.id} className="max-w-full">
            <Link
              href={orgPath(org.handle)}
              className="border-hairline-strong bg-surface-1 hover:border-primary/50 flex max-w-full items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors"
            >
              <OrgAvatar org={org} className="h-7 w-7" />
              <span className="text-ink truncate font-semibold">{org.name}</span>
              <span className="text-ink-muted shrink-0">{roleLabel(role)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </PageSection>
  )
}
