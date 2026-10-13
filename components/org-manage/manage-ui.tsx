import { useState, type ReactNode } from 'react'
import type { Remote } from '../../hooks/use-remote'
import { orgErrorText } from '../../lib/orgs/errors'
import { buttonClasses } from '../site/primitives'

/** A titled block of a manage section (h3 region). */
export function Panel({
  id,
  title,
  description,
  actions,
  children,
}: {
  id: string
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="border-hairline bg-surface-1 rounded-card min-w-0 border p-5 md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={id} className="text-ink text-lg font-semibold">
            {title}
          </h3>
          {description && (
            <p className="text-ink-muted mt-1 max-w-[70ch] text-sm leading-6">{description}</p>
          )}
        </div>
        {actions}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

/** A read's three states: loading, failed (with a retry) or its content. */
export function RemoteView<T>({
  remote,
  what,
  onRetry,
  children,
}: {
  remote: Remote<T>
  what: string
  onRetry: () => void
  children: (value: T) => ReactNode
}) {
  if (remote.status === 'loading') {
    return (
      <p role="status" className="text-ink-muted text-sm">
        Loading {what}…
      </p>
    )
  }
  if (remote.status === 'error') {
    return (
      <div role="alert" className="text-sm">
        <p className="text-ink">
          The {what} did not load. {orgErrorText(remote.error.code)}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className={buttonClasses('secondary', 'md', 'mt-3')}
        >
          Try again
        </button>
      </div>
    )
  }
  return <>{children(remote.value)}</>
}

/** A destructive action that asks once more in place before it runs. */
export function ConfirmButton({
  label,
  confirm,
  onConfirm,
  busy = false,
}: {
  label: string
  confirm: string
  onConfirm: () => void
  busy?: boolean
}) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setAsking(true)}
        className={buttonClasses('ghost', 'md', 'text-danger-ink')}
      >
        {label}
      </button>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
        className={buttonClasses('secondary', 'md', 'border-danger-ink/50 text-danger-ink')}
      >
        {confirm}
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className={buttonClasses('ghost', 'md')}
      >
        Cancel
      </button>
    </span>
  )
}
