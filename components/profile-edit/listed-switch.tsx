// The people-search opt-in. Off by default; saved (and signed) with the rest
// of the form.

interface ListedSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
}

export function ListedSwitch({ checked, onChange }: ListedSwitchProps) {
  return (
    <div className="border-border flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="space-y-1">
        <span id="listed-label" className="text-foreground block text-sm font-semibold">
          List me in people search
        </span>
        <p id="listed-hint" className="text-muted-foreground text-xs leading-5">
          Your name, handle, avatar and bio appear when someone searches people on renown.id. Your profile page is
          public either way.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby="listed-label"
        aria-describedby="listed-hint"
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
          checked ? 'bg-primary border-primary' : 'bg-muted border-input'
        }`}
      >
        <span
          aria-hidden="true"
          className={`bg-background inline-block h-5 w-5 rounded-full shadow-sm transition-transform motion-reduce:transition-none ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}
