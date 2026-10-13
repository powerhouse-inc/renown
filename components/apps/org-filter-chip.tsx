import Link from 'next/link'
import { orgPath } from '../../lib/orgs/format'

/** The active organisation filter of /apps, with a way back to every app. */
export function OrgFilterChip({ handle, name }: { handle: string; name: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="bg-primary-strong text-primary-foreground inline-flex h-9 max-w-full items-center rounded-full px-4 text-sm font-medium">
        <span className="truncate">Published by {name ?? `@${handle}`}</span>
      </span>
      {name && (
        <Link href={orgPath(handle)} className="text-primary-ink text-sm font-semibold underline-offset-4 hover:underline">
          About {name}
        </Link>
      )}
      <Link href="/apps" className="text-primary-ink text-sm font-semibold underline-offset-4 hover:underline">
        Show all apps
      </Link>
    </div>
  )
}
