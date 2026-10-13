// The report dialog. It signs with the wallet session, so ReportOrgButton
// loads it inside the wallet shell, and only once the button is pressed.
import { useEffect, useState } from 'react'
import { orgWriter, sessionSigner } from '../../services/org-client-write'
import type { OrgReportReason } from '../../services/org-security'
import { useMeSession } from '../me/use-me-session'
import { Field, inputClass } from '../profile-edit/field'
import { buttonClasses } from '../site/primitives'

const REASONS: { value: OrgReportReason; label: string }[] = [
  { value: 'IMPERSONATION', label: 'It pretends to be someone else' },
  { value: 'HANDLE_DISPUTE', label: 'Its handle is ours' },
  { value: 'SPAM', label: 'Spam' },
  { value: 'ABUSE', label: 'Abuse or harassment' },
  { value: 'OTHER', label: 'Something else' },
]
const MAX_DETAILS = 1000

export function ReportOrgDialog({ orgId, orgName, onClose }: { orgId: string; orgName: string; onClose: () => void }) {
  const session = useMeSession()
  const [reason, setReason] = useState<OrgReportReason>('IMPERSONATION')
  const [details, setDetails] = useState('')
  const [state, setState] = useState<{ status: 'idle' | 'sending' | 'sent' } | { status: 'error'; message: string }>({ status: 'idle' })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function send() {
    if (session.state !== 'signed-in') return
    setState({ status: 'sending' })
    const text = details.trim()
    const result = await orgWriter(sessionSigner(session)).write('reportOrganization', { orgId, reason, ...(text && { details: text.slice(0, MAX_DETAILS) }) })
    if (result.ok) setState({ status: 'sent' })
    // D22: 5 reports per address per day.
    else setState({ status: 'error', message: result.code === 'RATE_LIMITED' ? 'You can send 5 reports a day.' : result.message })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby="report-title" className="border-hairline bg-background shadow-modal rounded-panel max-h-full w-full max-w-md overflow-y-auto border p-6">
        <h2 id="report-title" className="text-ink text-h3 break-words">
          Report {orgName}
        </h2>
        {session.state === 'loading' ? (
          <p role="status" className="text-ink-muted mt-4">
            Loading…
          </p>
        ) : session.state === 'signed-out' ? (
          <div className="mt-4 space-y-4">
            <p className="text-ink-muted leading-7">Reports are signed, so Renown&apos;s moderators know each one comes from a real person.</p>
            <button type="button" onClick={session.login} className={buttonClasses('primary', 'md')}>
              Sign in to report
            </button>
          </div>
        ) : state.status === 'sent' ? (
          <p role="status" className="text-ink mt-4 leading-7">
            Thank you. Renown&apos;s moderators will look at it.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <fieldset>
              <legend className="text-ink text-sm font-semibold">Why are you reporting it?</legend>
              {REASONS.map((option) => (
                <label key={option.value} className="text-ink mt-2 flex items-center gap-2 text-sm">
                  <input type="radio" name="report-reason" checked={reason === option.value} onChange={() => setReason(option.value)} />
                  {option.label}
                </label>
              ))}
            </fieldset>
            <Field id="report-details" label="Details (optional)" counter={`${details.length}/${MAX_DETAILS}`}>
              <textarea id="report-details" rows={4} maxLength={MAX_DETAILS} className={inputClass} value={details} onChange={(e) => setDetails(e.target.value)} />
            </Field>
            <p className="text-ink-muted text-xs">You can send 5 reports a day.</p>
            {state.status === 'error' && (
              <p role="alert" className="text-danger-ink text-sm">
                {state.message}
              </p>
            )}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {session.state === 'signed-in' && state.status !== 'sent' && (
            <button type="button" disabled={state.status === 'sending'} onClick={() => void send()} className={buttonClasses('primary', 'md')}>
              {state.status === 'sending' ? 'Sending…' : 'Send report'}
            </button>
          )}
          <button type="button" onClick={onClose} className={buttonClasses('ghost', 'md')}>
            {state.status === 'sent' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
