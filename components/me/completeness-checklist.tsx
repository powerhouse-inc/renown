import Link from 'next/link'
import type { Completeness } from '../../lib/me/completeness'
import { cx } from '../../utils/cx'

/** What is left to complete the public profile, each open item linking to the editor. */
export function CompletenessChecklist({ completeness }: { completeness: Completeness }) {
  const complete = completeness.done === completeness.total
  return (
    <section aria-labelledby="completeness-title" className="border-hairline rounded-panel border p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="completeness-title" className="text-ink text-base font-semibold">
          Your public profile
        </h2>
        <p className="text-ink-muted text-sm tabular-nums">
          {completeness.done} of {completeness.total} done
        </p>
      </div>
      {complete ? (
        <p className="text-ink-muted mt-3 text-sm leading-6">Your profile is complete. People see a name, a face and where to find you.</p>
      ) : (
        <ul className="mt-4 space-y-1">
          {completeness.items.map((item) => (
            <li key={item.key}>
              {item.done ? (
                <span className="text-ink-muted flex items-center gap-3 py-1.5 text-sm">
                  <Check done />
                  <span className="line-through decoration-1">{item.label}</span>
                  <span className="sr-only">(done)</span>
                </span>
              ) : (
                <Link
                  href="/profile/edit"
                  className="text-ink hover:text-primary-ink flex items-center gap-3 py-1.5 text-sm font-medium transition-colors"
                >
                  <Check done={false} />
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Check({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
        done ? 'bg-signal/15 border-signal/40 text-signal' : 'border-hairline-strong',
      )}
    >
      {done && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L20 7" />
        </svg>
      )}
    </span>
  )
}
