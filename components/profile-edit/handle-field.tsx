import { useEffect, useState } from 'react'
import { getHandleAvailability, type HandleAvailability } from '../../services/switchboard'
import { HANDLE_RE, normalizeHandle } from '../../utils/profile-form'
import { Field, inputClass } from './field'

const DEBOUNCE_MS = 400
const REASONS: Record<NonNullable<HandleAvailability['reason']>, string> = {
  INVALID: '3–30 lowercase letters, digits or hyphens; no hyphen at the start or end.',
  RESERVED: 'This handle is reserved.',
  TAKEN: 'This handle is taken.',
}


interface HandleFieldProps {
  value: string
  onChange: (value: string) => void
  address: string
  /** The handle the profile already has (always available to its owner). */
  current: string
  /** An error from the last save attempt (e.g. HANDLE_TAKEN), shown until the value changes. */
  serverError?: string
  ensSuggestion?: string | null
}

/** @handle input with a live availability check against the read model. */
export function HandleField({ value, onChange, address, current, serverError, ensSuggestion }: HandleFieldProps) {
  const handle = normalizeHandle(value)
  const needsCheck = !!handle && handle !== current && HANDLE_RE.test(handle)
  // The latest answer; it only counts while it is about the handle in the input.
  const [answer, setAnswer] = useState<HandleAvailability | null>(null)

  useEffect(() => {
    if (!needsCheck) return
    const timer = setTimeout(() => {
      getHandleAvailability(handle, address)
        .then(setAnswer)
        .catch(() => setAnswer(null))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [needsCheck, handle, address])

  const result = needsCheck && answer?.handle === handle ? answer : null
  const check = !needsCheck
    ? null
    : result
      ? ({ state: 'done', result } as const)
      : ({ state: 'checking' } as const)

  const formatError = handle && !HANDLE_RE.test(handle) ? REASONS.INVALID : undefined
  const availabilityError =
    check?.state === 'done' && !check.result.available && check.result.reason ? REASONS[check.result.reason] : undefined
  const error = formatError ?? availabilityError ?? serverError
  const hint =
    check?.state === 'checking'
      ? 'Checking…'
      : check?.state === 'done' && check.result.available
        ? `renown.id/@${handle} is available.`
        : handle
          ? `Your profile: renown.id/@${handle}`
          : 'Pick a handle to get a short profile URL.'

  return (
    <Field id="handle" label="Handle" error={error} hint={hint}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">@</span>
          <input
            id="handle"
            className={`${inputClass} pl-7`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            maxLength={30}
            aria-invalid={!!error}
            aria-describedby={error ? 'handle-error' : undefined}
            placeholder="your-name"
          />
        </div>
        {ensSuggestion && ensSuggestion !== handle && (
          <button
            type="button"
            onClick={() => onChange(ensSuggestion)}
            className="border-border text-foreground hover:bg-foreground/10 shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors"
          >
            Use @{ensSuggestion}
          </button>
        )}
      </div>
    </Field>
  )
}
