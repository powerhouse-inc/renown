import type { MetricAggregation, UserStatEntry } from '../services/app-stats'

/** 1,234 · 12.5K · 1.2M · 0.13 — compact from 10,000 on. Same output on server and client. */
export function formatStatValue(value: number): string {
  const options: Intl.NumberFormatOptions =
    Math.abs(value) >= 10_000 ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: 2 }
  return new Intl.NumberFormat('en-US', options).format(value)
}

/** "Oct 9, 2026" in UTC, so server and client render the same text. */
export function formatStatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** How a tile names its aggregation. */
export const AGGREGATION_CAPTION: Record<MetricAggregation, string> = {
  SUM: 'Total',
  MAX: 'Highest',
  AVG: 'Average',
  COUNT_USERS: 'Users',
}

export interface AppStatGroup {
  appDid: string
  appName: string
  appDocumentId: string
  appHasLogo: boolean
  appLogoRef: string | null
  appLogo: string | null
  entries: UserStatEntry[]
}

/** What a profile shows: declared public metrics only (undeclared ones, label null, are dropped), grouped by app in first-seen order. Apps without a document are skipped. */
export function groupUserStats(stats: UserStatEntry[]): AppStatGroup[] {
  const groups = new Map<string, AppStatGroup>()
  for (const stat of stats) {
    if (stat.appDocumentId === null || stat.label === null) continue
    let group = groups.get(stat.appDid)
    if (!group) {
      group = {
        appDid: stat.appDid,
        appName: stat.appName || 'Untitled app',
        appDocumentId: stat.appDocumentId,
        appHasLogo: stat.appHasLogo,
        appLogoRef: stat.appLogoRef,
        appLogo: stat.appLogo,
        entries: [],
      }
      groups.set(stat.appDid, group)
    }
    group.entries.push(stat)
  }
  return [...groups.values()]
}
