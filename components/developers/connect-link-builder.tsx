import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { buildConnectLink } from '../../utils/connect-link'
import { DEFAULT_CREDENTIAL_VALIDITY_DAYS } from '../../utils/credential-validity'
import { publicOrigin } from '../../utils/seo'
import { cx } from '../../utils/cx'
import { buttonClasses } from '../site/primitives'

const PRESETS = [1, 7, 30, 90, 365]

const inputClass =
  'border-hairline-strong bg-surface-1 text-ink placeholder:text-ink-muted/70 focus-visible:border-primary h-11 w-full rounded-[var(--radius-control)] border px-3.5 font-mono text-sm outline-none transition-colors aria-invalid:border-destructive'

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="text-ink mb-2 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="text-destructive mt-2 text-sm">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-msg`} className="text-ink-muted mt-2 text-sm">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

/** Interactive builder for a `?connect=` link, validated live with the sign-in flow's own parsers. */
export function ConnectLinkBuilder() {
  const uid = useId()
  const [appDid, setAppDid] = useState('')
  const [returnUrl, setReturnUrl] = useState('')
  const [days, setDays] = useState(String(DEFAULT_CREDENTIAL_VALIDITY_DAYS))
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const copied = status === 'copied'
  const result = useMemo(
    () => buildConnectLink({ origin: publicOrigin(), appDid, returnUrl, expiresInDays: days }),
    [appDid, returnUrl, days],
  )
  // Untouched DID field: no error yet, just the hint.
  const didError = appDid ? result.errors.appDid : undefined

  async function copy() {
    if (!result.url) return
    try {
      await navigator.clipboard.writeText(result.url)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus('idle'), 2000)
  }

  const ids = { did: `${uid}-did`, ret: `${uid}-ret`, days: `${uid}-days` }
  return (
    <div className="border-hairline bg-surface-1 rounded-panel shadow-card border p-5 md:p-8">
      <form className="grid gap-6" onSubmit={(event) => event.preventDefault()} aria-label="Connect link builder">
        <Field id={ids.did} label="App DID" hint="Your app's Renown identity (renown.did in the SDK)." error={didError}>
          <input
            id={ids.did}
            className={inputClass}
            value={appDid}
            onChange={(event) => setAppDid(event.target.value)}
            placeholder="did:key:zDn…"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={Boolean(didError)}
            aria-describedby={`${ids.did}-msg`}
          />
        </Field>
        <Field
          id={ids.ret}
          label="Return URL (optional)"
          hint="Where Renown sends the user back, with ?user=did:pkh:… appended."
          error={result.errors.returnUrl}
        >
          <input
            id={ids.ret}
            className={inputClass}
            value={returnUrl}
            onChange={(event) => setReturnUrl(event.target.value)}
            placeholder="https://app.example.com/auth/renown"
            spellCheck={false}
            autoComplete="off"
            inputMode="url"
            aria-invalid={Boolean(result.errors.returnUrl)}
            aria-describedby={`${ids.ret}-msg`}
          />
        </Field>
        <fieldset>
          <legend className="text-ink mb-2 text-sm font-medium">Credential validity</legend>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => {
              const active = days === String(preset)
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDays(String(preset))}
                  className={cx(
                    'h-9 rounded-full border px-3.5 text-sm font-medium transition-colors',
                    active ? 'border-primary bg-primary/10 text-primary-ink' : 'border-hairline-strong text-ink hover:bg-surface-2',
                  )}
                >
                  {preset === 1 ? '1 day' : `${preset} days`}
                </button>
              )
            })}
          </div>
          <div className="mt-3 max-w-[12rem]">
            <label htmlFor={ids.days} className="sr-only">
              Days
            </label>
            <div className="relative">
              <input
                id={ids.days}
                className={cx(inputClass, 'pr-14')}
                value={days}
                onChange={(event) => setDays(event.target.value)}
                inputMode="numeric"
                aria-invalid={Boolean(result.errors.expiresInDays)}
                aria-describedby={`${ids.days}-msg`}
              />
              <span aria-hidden="true" className="text-ink-muted pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm">
                days
              </span>
            </div>
          </div>
          <p id={`${ids.days}-msg`} className={cx('mt-2 text-sm', result.errors.expiresInDays ? 'text-destructive' : 'text-ink-muted')}>
            {result.errors.expiresInDays ??
              (result.clamped
                ? `Longer than the maximum: the flow will ask for ${result.effectiveDays} days.`
                : result.effectiveDays === DEFAULT_CREDENTIAL_VALIDITY_DAYS
                  ? 'The default validity.'
                  : 'Not the default, so the user confirms this validity explicitly.')}
          </p>
        </fieldset>
      </form>

      <div className="border-hairline mt-8 border-t pt-6">
        <p className="text-ink mb-2 text-sm font-medium" id={`${uid}-out-label`}>
          Your connect link
        </p>
        <output
          aria-labelledby={`${uid}-out-label`}
          data-testid="connect-link-output"
          className={cx(
            'bg-code border-hairline block min-h-11 rounded-[var(--radius-control)] border px-3.5 py-3 font-mono text-sm break-all',
            result.url ? 'text-ink' : 'text-ink-muted',
          )}
        >
          {result.url ?? 'Enter a valid app DID to generate the link.'}
        </output>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={!result.url} onClick={() => void copy()} className={buttonClasses('primary', 'md')}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
          {result.url ? (
            <a href={result.url.replace(publicOrigin(), '')} target="_blank" rel="noopener noreferrer" className={buttonClasses('secondary', 'md')}>
              Try it
            </a>
          ) : (
            <span aria-disabled="true" className={buttonClasses('secondary', 'md', 'pointer-events-none opacity-60')}>
              Try it
            </span>
          )}
          <span role="status" aria-live="polite" className="sr-only">
            {copied ? 'Copied' : status === 'failed' ? "Couldn't copy. Select the link above." : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
