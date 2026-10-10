import Link from 'next/link'
import type { Completeness } from '../../lib/me/completeness'
import { ButtonLink } from '../site/primitives'
import { useViewerAddress } from '../identity/use-viewer-address'

/**
 * "Edit profile" and, while the profile is incomplete, how far along it is:
 * only for the signed-in owner (client-side, after hydration), never for anyone else.
 */
export function ProfileOwnerActions({ address, completeness }: { address: string; completeness: Completeness }) {
  const viewer = useViewerAddress()
  if (!viewer || viewer !== address.toLowerCase()) return null
  const open = completeness.items.filter((item) => !item.done)
  return (
    <>
      <ButtonLink href="/profile/edit" variant="secondary">
        Edit profile
      </ButtonLink>
      {open.length > 0 && (
        <Link
          href="/profile/edit"
          title={`To do: ${open.map((item) => item.label.toLowerCase()).join(', ')}`}
          className="text-ink-muted hover:text-ink hover:bg-surface-2 inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors"
        >
          <Ring percent={completeness.percent} />
          <span>
            {completeness.done} of {completeness.total}
            <span className="sr-only"> profile steps done, finish your profile</span>
          </span>
        </Link>
      )}
    </>
  )
}

function Ring({ percent }: { percent: number }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" className="-rotate-90">
      <circle cx="10" cy="10" r="8" fill="none" strokeWidth="2.5" style={{ stroke: 'var(--hairline-strong)' }} />
      <circle cx="10" cy="10" r="8" fill="none" strokeWidth="2.5" strokeLinecap="round" pathLength={100} strokeDasharray={`${percent} 100`} style={{ stroke: 'var(--signal)' }} />
    </svg>
  )
}
