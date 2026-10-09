// Which network numbers the homepage shows (pure; used on server and client).
import type { NetworkPulse } from '../components/home/types'

/** Smallest number worth showing when NEXT_PUBLIC_PULSE_MIN is unset or invalid. */
export const DEFAULT_PULSE_MIN = 25

export type PulseKey = 'identities' | 'activeCredentials' | 'activeUsers30d' | 'apps'

export interface PulseMetric {
  key: PulseKey
  value: number
  label: string
}

/** Display order and wording of every metric. */
export const PULSE_LABELS: { key: PulseKey; label: string }[] = [
  { key: 'identities', label: 'people with a Renown ID' },
  { key: 'activeCredentials', label: 'active app approvals' },
  { key: 'activeUsers30d', label: 'people active in apps in the last 30 days' },
  { key: 'apps', label: 'apps with a Renown identity' },
]

/**
 * The threshold from NEXT_PUBLIC_PULSE_MIN (inlined at build time, so server
 * and client agree): a whole number >= 0, else DEFAULT_PULSE_MIN.
 */
export function pulseMin(raw: string | undefined = process.env.NEXT_PUBLIC_PULSE_MIN): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return DEFAULT_PULSE_MIN
  return Number(raw.trim())
}

/** The metrics at or above `min`, in display order; empty hides the section. */
export function visibleMetrics(pulse: NetworkPulse | null | undefined, min: number): PulseMetric[] {
  if (!pulse) return []
  return PULSE_LABELS.filter(({ key }) => Number.isFinite(pulse[key]) && pulse[key] >= min).map(({ key, label }) => ({
    key,
    label,
    value: pulse[key],
  }))
}
