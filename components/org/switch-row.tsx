import { cx } from '../../utils/cx'

interface SwitchRowProps {
  id: string
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

/** A labelled on/off switch with a sentence on what it does. */
export function SwitchRow({ id, label, hint, checked, onChange, disabled = false }: SwitchRowProps) {
  return (
    <div className="border-hairline flex items-start justify-between gap-4 rounded-xl border p-4">
      <div className="min-w-0 space-y-1">
        <span id={`${id}-label`} className="text-ink block text-sm font-semibold">
          {label}
        </span>
        <p id={`${id}-hint`} className="text-ink-muted text-xs leading-5">
          {hint}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60',
          checked ? 'bg-primary border-primary' : 'bg-background border-ink-muted',
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            'inline-block h-5 w-5 rounded-full shadow-sm transition-transform motion-reduce:transition-none',
            checked ? 'bg-background translate-x-5' : 'bg-ink-muted translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}
