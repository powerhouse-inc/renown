import Link from 'next/link'
import type { ReactNode } from 'react'
import type { AppMetricStat, AppStats, MetricAggregation, MetricContributor } from '../../services/app-stats'
import { formatStatDate, formatStatValue } from '../../utils/stat-format'
import { shortAddress } from '../../lib/profile-identity'
import { MetricCard } from '../identity/metric-card'
import { PageSection } from '../identity/page-section'
import { ProfileAvatar } from '../profile/profile-avatar'

/** What a metric's number means, in plain words. */
export const AGGREGATION_MEANING: Record<MetricAggregation, string> = {
  SUM: 'Total across all users',
  MAX: 'Highest by a single user',
  AVG: 'Average per user',
  COUNT_USERS: 'Number of users',
}

/** True when the app reports nothing yet: no users and every metric at zero. */
export function hasNoActivity(stats: AppStats): boolean {
  return stats.totalUsers === 0 && stats.metrics.every((m) => m.value === 0)
}

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

function Leaderboard({ metric }: { metric: AppMetricStat }) {
  return (
    <div className="border-hairline rounded-card min-w-0 border p-4">
      <h4 className="text-ink text-sm font-semibold">{metric.label}</h4>
      <ol className="mt-3 space-y-1">
        {metric.top.map((c, i) => {
          const href = contributorHref(c)
          const body: ReactNode = (
            <>
              <span className="text-ink-muted w-4 shrink-0 text-xs tabular-nums">{i + 1}</span>
              <ProfileAvatar documentId={c.documentId} avatar={c.avatar} userImage={c.userImage} seed={c.address ?? c.userDid} alt="" className="h-7 w-7 shrink-0" />
              <span className="text-ink min-w-0 flex-1 truncate text-sm">{contributorName(c)}</span>
              <span className="text-ink shrink-0 text-sm font-semibold tabular-nums">{withUnit(c.value, metric.unit)}</span>
            </>
          )
          return (
            <li key={c.userDid}>
              {href ? (
                <Link href={href} className="hover:bg-surface-2 -mx-2 flex items-center gap-3 rounded-lg px-2 py-1 transition-colors">
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

/** The app's public numbers: active users, one card per declared metric, top contributors; a calm empty state at zero. */
export function AppStatsSection({ stats, appName }: { stats: AppStats; appName: string }) {
  const empty = hasNoActivity(stats)
  const boards = stats.metrics.filter((m) => m.top.length > 0)
  return (
    <PageSection
      id="app-stats-heading"
      title="Stats"
      aside={stats.updatedAt && !empty ? <span className="text-ink-muted text-xs">Updated {formatStatDate(stats.updatedAt)}</span> : null}
    >
      {empty ? (
        <div className="border-hairline rounded-card border border-dashed px-6 py-8">
          <p className="text-ink font-semibold">No activity reported yet</p>
          <p className="text-ink-muted mt-1.5 max-w-[52ch] text-sm leading-6">
            When people use {appName}, the numbers it reports appear here
            {stats.metrics.length > 0 ? `, starting with ${stats.metrics.map((m) => m.label.toLowerCase()).join(', ')}` : ''}.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {stats.totalUsers > 0 && (
              <MetricCard value={stats.activeUsers30d} label="Active in the last 30 days" meaning={`of ${formatStatValue(stats.totalUsers)} users`} />
            )}
            {stats.metrics.map((m) => (
              <MetricCard key={m.key} metricKey={m.key} value={m.value} unit={m.unit} label={m.label} meaning={AGGREGATION_MEANING[m.aggregation]} description={m.description} />
            ))}
          </div>
          {boards.length > 0 && (
            <div className="mt-8">
              <h3 className="text-ink text-base font-semibold">Top contributors</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {boards.map((m) => (
                  <Leaderboard key={m.key} metric={m} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </PageSection>
  )
}
