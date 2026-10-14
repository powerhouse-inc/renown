import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Remote } from '../../hooks/use-remote'
import { orgErrorText } from '../../lib/orgs/errors'
import { cx } from '../../utils/cx'
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
            <p className="text-ink-muted mt-1 max-w-[70ch] text-sm leading-6 break-words">{description}</p>
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
/** For buttons whose label carries a long unbreakable value (a DID, a domain): wrap instead of widening the page. */
export const LONG_LABEL = 'h-auto! min-h-10 max-w-full py-2 text-left whitespace-normal! break-all'

export function ConfirmButton({
  label,
  confirm,
  onConfirm,
  busy = false,
  ariaLabel,
}: {
  label: string
  /** The first button's accessible name when the visible label alone is ambiguous (one per row); starts with `label`. */
  ariaLabel?: string
  confirm: string
  onConfirm: () => void
  busy?: boolean
}) {
  const [asking, setAsking] = useState(false)
  // Keyboard focus follows the swap: to the confirm control when it appears, and back to the
  // first button when the question goes away (once it is enabled again after a write).
  const trigger = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  useEffect(() => {
    if (asking) {
      confirmRef.current?.focus()
    } else if (returnFocus.current && trigger.current && !trigger.current.disabled) {
      returnFocus.current = false
      // Never pull focus away from where someone moved it during a write.
      const focused = document.activeElement
      if (!focused || focused === document.body) trigger.current.focus()
    }
  }, [asking, busy])
  function stopAsking() {
    returnFocus.current = true
    setAsking(false)
  }
  if (!asking) {
    return (
      <button
        ref={trigger}
        type="button"
        disabled={busy}
        aria-label={ariaLabel}
        onClick={() => setAsking(true)}
        className={buttonClasses('ghost', 'md', cx('text-danger-ink', LONG_LABEL))}
      >
        {label}
      </button>
    )
  }
  return (
    <span
      className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-2"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          stopAsking()
        }
      }}
    >
      <button
        ref={confirmRef}
        type="button"
        disabled={busy}
        onClick={() => {
          stopAsking()
          onConfirm()
        }}
        className={buttonClasses('secondary', 'md', cx('border-danger-ink/50 text-danger-ink', LONG_LABEL))}
      >
        {confirm}
      </button>
      <button type="button" onClick={stopAsking} className={buttonClasses('ghost', 'md')}>
        Cancel
      </button>
    </span>
  )
}
