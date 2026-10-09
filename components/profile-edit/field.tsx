import type { ReactNode } from 'react'

interface FieldProps {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  /** e.g. "12/280", shown right-aligned under the input. */
  counter?: string
  /** A group of controls (not one input): the label names the group instead of pointing at an input. */
  group?: boolean
  children: ReactNode
}

/** Label, control, then the error (or the hint) and an optional counter. */
export function Field({ id, label, hint, error, counter, group, children }: FieldProps) {
  const labelClass = 'text-foreground block text-sm font-semibold'
  return (
    <div className="space-y-1.5" role={group ? 'group' : undefined} aria-labelledby={group ? `${id}-label` : undefined}>
      {group ? (
        <span id={`${id}-label`} className={labelClass}>
          {label}
        </span>
      ) : (
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
      )}
      {children}
      <div className="flex items-start justify-between gap-3 text-xs">
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-destructive">
            {error}
          </p>
        ) : (
          <p className="text-muted-foreground">{hint}</p>
        )}
        {counter && <span className="text-muted-foreground shrink-0 tabular-nums">{counter}</span>}
      </div>
    </div>
  )
}

export const inputClass =
  'border-input bg-background/60 text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 aria-[invalid=true]:border-destructive'
