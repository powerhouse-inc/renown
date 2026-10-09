import Link from 'next/link'
import { isExpired, shortDid, type Connection, type ConnectionGroup } from '../../lib/me/connections'
import { formatAbsolute, formatRelative } from '../../utils/relative-time'
import { AppLogo } from '../app/app-logo'
import { Badge } from '../site/primitives'

function When({ iso, now }: { iso: string; now: Date }) {
  return (
    <time dateTime={iso}>
      {formatRelative(iso, now)}
      <span className="text-ink-muted"> ({formatAbsolute(iso)})</span>
    </time>
  )
}

function Row({
  group,
  connection,
  now,
  onRevoke,
}: {
  group: ConnectionGroup
  connection: Connection
  now: Date
  onRevoke: (group: ConnectionGroup, connection: Connection) => void
}) {
  const expired = isExpired(connection.expiresAt, now)
  return (
    <li className="border-hairline flex flex-col gap-3 border-t py-4 sm:flex-row sm:items-center sm:justify-between">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-muted">Approved</dt>
        <dd className="text-ink">
          <When iso={connection.issuedAt} now={now} />
        </dd>
        <dt className="text-ink-muted">{expired ? 'Expired' : 'Expires'}</dt>
        <dd className="text-ink flex flex-wrap items-center gap-2">
          {connection.expiresAt ? <When iso={connection.expiresAt} now={now} /> : 'Never'}
          {expired && <Badge>Expired</Badge>}
        </dd>
      </dl>
      <button
        type="button"
        onClick={() => onRevoke(group, connection)}
        aria-label={`Revoke ${group.name}, approved ${formatAbsolute(connection.issuedAt)}`}
        className="border-hairline-strong text-danger-ink hover:border-danger/60 hover:bg-danger/10 self-start rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors sm:self-auto"
      >
        Revoke
      </button>
    </li>
  )
}

function SessionGlyph() {
  return (
    <span aria-hidden="true" className="bg-surface-2 border-hairline text-primary-ink grid h-12 w-12 shrink-0 place-items-center rounded-2xl border">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5h16v14H4zM8 10l3 2-3 2M13 15h3" />
      </svg>
    </span>
  )
}

function Group({
  group,
  now,
  onRevoke,
}: {
  group: ConnectionGroup
  now: Date
  onRevoke: (group: ConnectionGroup, connection: Connection) => void
}) {
  return (
    <li className="border-hairline bg-surface-1 rounded-panel border px-5 pt-5 pb-1">
      <div className="flex items-center gap-4 pb-4">
        {group.app ? (
          <AppLogo
            documentId={group.app.documentId}
            logoRef={group.app.logoRef}
            legacyLogo={group.app.logo}
            name={group.name}
            className="h-12 w-12 text-lg ring-0"
          />
        ) : (
          <SessionGlyph />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-ink truncate text-base font-semibold">
            {group.app ? (
              <Link href={`/app/${group.subject}`} className="hover:text-primary-ink transition-colors">
                {group.name}
              </Link>
            ) : (
              group.name
            )}
          </h3>
          <p className="text-ink-muted truncate font-mono text-xs" title={group.subject}>
            {shortDid(group.subject)}
          </p>
        </div>
        {group.connections.length > 1 && <Badge tone="primary">{group.connections.length} approvals</Badge>}
      </div>
      <ul aria-label={`${group.name} approvals`}>
        {group.connections.map((connection) => (
          <Row key={connection.credentialId} group={group} connection={connection} now={now} onRevoke={onRevoke} />
        ))}
      </ul>
    </li>
  )
}

/** One section of /me: a heading and its groups, or a one-line empty note. */
export function ConnectionSection({
  id,
  title,
  description,
  empty,
  groups,
  now,
  onRevoke,
}: {
  id: string
  title: string
  description: string
  empty: string
  groups: ConnectionGroup[]
  now: Date
  onRevoke: (group: ConnectionGroup, connection: Connection) => void
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} tabIndex={-1} className="text-ink text-h3 outline-none">
        {title}
      </h2>
      <p className="text-ink-muted mt-1.5 text-sm leading-6">{description}</p>
      {groups.length === 0 ? (
        <p className="border-hairline-strong text-ink-muted rounded-panel mt-5 border border-dashed px-5 py-6 text-sm">{empty}</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {groups.map((group) => (
            <Group key={group.subject} group={group} now={now} onRevoke={onRevoke} />
          ))}
        </ul>
      )}
    </section>
  )
}
