import Link from 'next/link'
import type { Remote } from '../../hooks/use-remote'
import { activeFirst } from '../../lib/orgs/active-org'
import { manageHref, roleLabel } from '../../lib/orgs/format'
import type { OrgAffiliation } from '../../services/orgs'
import { OrgAvatar } from '../org/org-avatar'

const SHOWN = 6

/** The account menu's "Your organisations" group: the last managed first, then "Create organisation". */
export function AccountOrgs({
  state,
  active,
  onPick,
  onClose,
  onRetry,
  itemClass,
}: {
  state: Remote<OrgAffiliation[]>
  active: string | null
  onPick: (orgId: string) => void
  onClose: () => void
  onRetry: () => void
  itemClass: string
}) {
  const list = state.status === 'ready' ? activeFirst(state.value, active) : []
  return (
    <div
      role="group"
      aria-label="Your organisations"
      className="border-hairline mt-1 border-t pt-1"
    >
      <p aria-hidden="true" className="text-ink-muted px-3 pt-2 pb-1 text-xs font-medium">
        Your organisations
      </p>
      {state.status === 'loading' && <p className="text-ink-muted px-3 py-2 text-sm">Loading…</p>}
      {state.status === 'error' && (
        <div role="alert" className="text-ink-muted px-3 py-2 text-sm">
          <p>Your organisations did not load.</p>
          <button type="button" role="menuitem" onClick={onRetry} className="text-primary-ink font-semibold underline-offset-4 hover:underline">
            Try again
          </button>
        </div>
      )}
      {list.slice(0, SHOWN).map(({ org, role }) => (
        <Link
          key={org.id}
          href={manageHref(org.handle)}
          role="menuitem"
          aria-current={org.id === active ? 'true' : undefined}
          className={itemClass}
          onClick={() => onPick(org.id)}
        >
          <OrgAvatar org={org} className="mr-2 h-6 w-6 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{org.name}</span>
          <span className="text-ink-muted ml-2 shrink-0 text-xs">{roleLabel(role)}</span>
        </Link>
      ))}
      {list.length > SHOWN && (
        <Link href="/me#organisations" role="menuitem" className={itemClass} onClick={onClose}>
          All organisations
        </Link>
      )}
      <Link href="/org/new" role="menuitem" className={itemClass} onClick={onClose}>
        Create organisation
      </Link>
    </div>
  )
}
