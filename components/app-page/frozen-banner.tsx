import Link from 'next/link'
import { orgPath } from '../../lib/orgs/format'
import type { OrgSummary } from '../../services/orgs'

/** An app its organisation froze (spec 3.6): it cannot act for anyone until unfrozen. */
export function FrozenBanner({ org }: { org: OrgSummary | null }) {
  return (
    <p role="status" className="border-caution-ink/35 bg-caution-ink/[0.07] text-ink rounded-card mt-6 border px-4 py-3 text-sm leading-6 sm:mx-8">
      <strong className="font-semibold">
        Frozen by{' '}
        {org ? (
          <Link href={orgPath(org.handle)} className="underline underline-offset-4">
            {org.name}
          </Link>
        ) : (
          'its organisation'
        )}
        .
      </strong>{' '}
      Keys it authorised do not count, and it cannot sign anyone in, until it is unfrozen.
    </p>
  )
}
