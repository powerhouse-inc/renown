import { formatStatValue } from '../../utils/stat-format'

export interface MetricCardProps {
  value: number
  unit?: string | null
  /** What was counted, in the app's own words ("Notes written"). */
  label: string
  /** What the number means ("Total across all users"); omitted on profiles. */
  meaning?: string | null
  /** The publisher's description of the metric. */
  description?: string | null
  /** Exposed as data-metric for tests and analytics. */
  metricKey?: string
}

/** One number with its unit and label, and optionally what it means. */
export function MetricCard({ value, unit, label, meaning, description, metricKey }: MetricCardProps) {
  return (
    <div className="border-hairline bg-surface-1 rounded-card min-w-0 border p-4" data-metric={metricKey} data-value={String(value)}>
      <p className="text-ink flex min-w-0 items-baseline gap-1.5">
        <span className="text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums">{formatStatValue(value)}</span>
        {unit && <span className="text-ink-muted truncate text-sm">{unit}</span>}
      </p>
      <p className="text-ink mt-2 text-sm font-medium [overflow-wrap:anywhere]">{label}</p>
      {meaning && <p className="text-ink-muted mt-0.5 text-xs">{meaning}</p>}
      {description && <p className="text-ink-muted mt-2 text-xs leading-5 [overflow-wrap:anywhere]">{description}</p>}
    </div>
  )
}
