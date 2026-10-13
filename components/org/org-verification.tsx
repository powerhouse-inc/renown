import Link from 'next/link'
import { orgPath } from '../../lib/orgs/format'
import type { OrgSummary } from '../../services/orgs'
import { Badge } from '../site/primitives'

function ShieldIcon() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z" />
      <path d="m8.8 12.2 2.2 2.2 4.4-4.6" />
    </svg>
  )
}

/** "Verified: <domain>" per verified domain, else "Unverified organisation". */
export function OrgVerification({ verifiedDomains }: { verifiedDomains: string[] }) {
  if (verifiedDomains.length === 0) return <Badge>Unverified organisation</Badge>
  return (
    <>
      {verifiedDomains.map((domain) => (
        <Badge key={domain} tone="signal" className="max-w-full">
          <ShieldIcon />
          <span className="truncate">Verified: {domain}</span>
        </Badge>
      ))}
    </>
  )
}

/** Shown when an unverified organisation carries the name of another one that has a verified domain. */
export function NotAffiliatedNote({ other }: { other: OrgSummary }) {
  return (
    <p role="note" className="border-caution-ink/35 bg-caution-ink/[0.07] text-ink rounded-card border px-4 py-3 text-sm leading-6">
      Not affiliated with the verified{' '}
      <Link href={orgPath(other.handle)} className="font-semibold underline underline-offset-4">
        {other.name}
      </Link>
      .
    </p>
  )
}
