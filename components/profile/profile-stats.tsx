import Link from 'next/link'
import { formatStatValue, groupUserStats } from '../../utils/stat-format'
import type { UserStatEntry } from '../../services/app-stats'
import { AppLogo } from '../app/app-logo'

/** The user's app stats, one card per app (logo and name link to the app page). */
export function ProfileStats({ stats }: { stats: UserStatEntry[] }) {
  const groups = groupUserStats(stats)
  if (groups.length === 0) return null
  return (
    <section aria-labelledby="profile-stats" className="space-y-3">
      <h2 id="profile-stats" className="text-foreground px-1 text-lg font-semibold">
        Stats
      </h2>
      <div className="grid grid-cols-1 gap-3">
        {groups.map((group) => (
          <div key={group.appDid} data-app-did={group.appDid} className="bg-secondary/60 min-w-0 rounded-2xl p-4">
            <Link href={`/app/${group.appDid}`} className="group flex min-w-0 max-w-full items-center gap-3">
              <AppLogo
                documentId={group.appDocumentId}
                logoRef={group.appHasLogo ? group.appLogoRef : null}
                legacyLogo={group.appLogo}
                name={group.appName}
                className="h-9 w-9 text-sm ring-2"
              />
              <span className="text-foreground truncate font-semibold group-hover:underline">{group.appName}</span>
            </Link>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {group.entries.map((entry) => (
                <div key={entry.metric} className="min-w-0" data-metric={entry.metric} data-value={String(entry.value)}>
                  <dt className="text-muted-foreground text-xs [overflow-wrap:anywhere]">{entry.label}</dt>
                  <dd className="text-foreground flex items-baseline gap-1">
                    <span className="text-xl font-bold tabular-nums">{formatStatValue(entry.value)}</span>
                    {entry.unit && <span className="text-muted-foreground truncate text-xs">{entry.unit}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  )
}
