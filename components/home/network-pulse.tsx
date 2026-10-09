import { useRef } from 'react'
import { useCountUp } from '../../hooks/use-count-up'
import { cx } from '../../utils/cx'
import { pulseMin, visibleMetrics, type PulseMetric } from '../../utils/pulse'
import { formatStatValue } from '../../utils/stat-format'
import { Heading, Section } from '../site/primitives'
import type { NetworkPulse } from './types'

const COLUMNS = ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3', 'md:grid-cols-4']

function Metric({ metric, index }: { metric: PulseMetric; index: number }) {
  const number = useRef<HTMLSpanElement>(null)
  useCountUp(number, metric.value, formatStatValue)
  const final = formatStatValue(metric.value)
  return (
    <div
      className={cx(
        'border-hairline flex flex-col py-8 md:px-8 md:py-10',
        index > 0 ? 'border-t md:border-t-0 md:border-l' : 'md:pl-0',
      )}
    >
      <dt className="text-ink-muted mt-3 max-w-[24ch] leading-6">{metric.label}</dt>
      <dd className="text-ink text-display order-first grid tabular-nums">
        {/* The final value reserves the width, so counting never moves the layout. */}
        <span aria-hidden="true" className="invisible col-start-1 row-start-1">
          {final}
        </span>
        <span ref={number} aria-hidden="true" className="col-start-1 row-start-1" data-testid={`pulse-${metric.key}`}>
          {final}
        </span>
        <span className="sr-only">{final}</span>
      </dd>
    </div>
  )
}

/**
 * The network pulse: each renownNetworkStats count at or above
 * NEXT_PUBLIC_PULSE_MIN (default 25), counting up on first view. Renders
 * nothing when no count qualifies or the stats were unavailable.
 */
export function NetworkPulseSection({ pulse }: { pulse?: NetworkPulse | null }) {
  const metrics = visibleMetrics(pulse, pulseMin())
  if (metrics.length === 0) return null
  return (
    <Section labelledBy="pulse-title" spacing="sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <Heading level={2} id="pulse-title">
          The network right now
        </Heading>
        <p className="text-ink-muted inline-flex items-center gap-2.5 text-sm">
          <span aria-hidden="true" className="relative flex h-2 w-2">
            <span className="bg-signal absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping" />
            <span className="bg-signal relative inline-flex h-2 w-2 rounded-full" />
          </span>
          Counted from Renown records, refreshed every five minutes
        </p>
      </div>
      <dl className={cx('border-hairline mt-10 grid border-t', COLUMNS[metrics.length])}>
        {metrics.map((metric, index) => (
          <Metric key={metric.key} metric={metric} index={index} />
        ))}
      </dl>
    </Section>
  )
}
