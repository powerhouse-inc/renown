import Link from 'next/link'
import type { ReactNode } from 'react'
import type { AppMetricStat, AppStats, MetricContributor } from '../../services/app-stats'
import { AGGREGATION_CAPTION, formatStatDate, formatStatValue } from '../../utils/stat-format'
import { ProfileAvatar } from '../profile/profile-avatar'
import { shortAddress } from '../profile/profile-summary'

function contributorName(c: MetricContributor): string {
  if (c.displayName) return c.displayName
  if (c.handle) return `@${c.handle}`
  if (c.address) return shortAddress(c.address)
  return `${c.userDid.slice(0, 16)}…${c.userDid.slice(-4)}`
}

function contributorHref(c: MetricContributor): string | null {
  if (c.handle) return `/@${c.handle}`
  if (c.address) return `/profile/${c.address}`
  return null
}

function withUnit(value: number, unit: string | null): string {
  return unit ? `${formatStatValue(value)} ${unit}` : formatStatValue(value)
}

function StatTile({
  caption,
  value,
  unit,
  label,
  metricKey,
  title,
}: {
  caption: string
  value: number
  unit: string | null
  label: string
  metricKey?: string
  title?: string
}) {
  return (
    <div className="bg-secondary/60 min-w-0 rounded-2xl p-4" data-metric={metricKey} data-value={String(value)} title={title}>
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{caption}</p>
      <p className="text-foreground mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums">{formatStatValue(value)}</span>
        {unit && <span className="text-muted-foreground truncate text-sm">{unit}</span>}
      </p>
      <p className="text-foreground/80 mt-0.5 truncate text-sm">{label}</p>
    </div>
  )
}

function Leaderboard({ metric }: { metric: AppMetricStat }) {
  return (
    <div className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
      <h4 className="text-foreground text-sm font-semibold">{metric.label}</h4>
      <ol className="mt-3 space-y-1">
        {metric.top.map((c, i) => {
          const href = contributorHref(c)
          const body: ReactNode = (
            <>
              <span className="text-muted-foreground w-4 shrink-0 text-xs tabular-nums">{i + 1}</span>
              <ProfileAvatar
                documentId={c.documentId}
                hasAvatar={c.hasAvatar}
                userImage={c.userImage}
                seed={c.address ?? c.userDid}
                alt=""
                className="h-7 w-7 shrink-0"
              />
              <span className="text-foreground min-w-0 flex-1 truncate text-sm">{contributorName(c)}</span>
              <span className="text-foreground shrink-0 text-sm font-semibold tabular-nums">{withUnit(c.value, metric.unit)}</span>
            </>
          )
          return (
            <li key={c.userDid}>
              {href ? (
                <Link href={href} className="hover:bg-secondary/60 -mx-2 flex items-center gap-3 rounded-lg px-2 py-1 transition-colors">
                  {body}
                </Link>
              ) : (
                <div className="flex items-center gap-3 py-1">{body}</div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** The public app page's stats: active users, one tile per public metric, top contributors. */
export function AppStatsSection({ stats }: { stats: AppStats }) {
  if (stats.metrics.length === 0 && stats.totalUsers === 0) return null
  const boards = stats.metrics.filter((m) => m.top.length > 0)
  return (
    <section aria-labelledby="app-stats-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="app-stats-heading" className="text-foreground text-lg font-semibold">
          Stats
        </h2>
        {stats.updatedAt && <span className="text-muted-foreground text-xs">Updated {formatStatDate(stats.updatedAt)}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          caption="Active · 30 days"
          value={stats.activeUsers30d}
          unit={null}
          label={`of ${formatStatValue(stats.totalUsers)} users`}
        />
        {stats.metrics.map((m) => (
          <StatTile
            key={m.key}
            metricKey={m.key}
            caption={AGGREGATION_CAPTION[m.aggregation]}
            value={m.value}
            unit={m.unit}
            label={m.label}
            title={m.description ?? undefined}
          />
        ))}
      </div>
      {boards.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-foreground text-sm font-semibold">Top contributors</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {boards.map((m) => (
              <Leaderboard key={m.key} metric={m} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
