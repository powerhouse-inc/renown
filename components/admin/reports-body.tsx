// /admin/reports for platform admins (RENOWN_PLATFORM_ADMINS). Everyone else,
// signed out or refused by the switchboard, sees the 404 content.
import Link from 'next/link'
import { useCallback, useState } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { orgPath, shortAddress } from '../../lib/orgs/format'
import { orgWriter, sessionSigner } from '../../services/org-client-write'
import { orgReports, type OrgReport, type OrgReportReason, type OrgReportResolution, type OrgReportStatus } from '../../services/org-security'
import { cx } from '../../utils/cx'
import { formatAbsolute } from '../../utils/relative-time'
import { useMeSession, type MeSession } from '../me/use-me-session'
import { useConfirm, type ConfirmRequest } from '../org-manage/confirm-dialog'
import { OrgBodyLoading } from '../org/org-body-loading'
import { Field, inputClass } from '../profile-edit/field'
import { ErrorState } from '../site/error-state'
import { Badge, buttonClasses, Container } from '../site/primitives'
import { ToastRegion, useToasts } from '../site/toast'

type SignedIn = Extract<MeSession, { state: 'signed-in' }>

const REASON_TEXT: Record<OrgReportReason, string> = {
  IMPERSONATION: 'Impersonation',
  HANDLE_DISPUTE: 'Handle dispute',
  SPAM: 'Spam',
  ABUSE: 'Abuse',
  OTHER: 'Other',
}
const RESOLUTION_LABEL: Record<OrgReportResolution, string> = {
  DISMISS: 'Dismiss',
  TAKE_DOWN: 'Take down',
  RELEASE_HANDLE: 'Release the handle',
  RESTORE: 'Restore',
}

/** What each high-impact resolution does, named for the organisation it acts on. */
function confirmation(resolution: OrgReportResolution, orgName: string, onConfirm: () => void): ConfirmRequest | null {
  switch (resolution) {
    case 'TAKE_DOWN':
      return {
        title: `Take down ${orgName}?`,
        body: `${orgName} disappears everywhere on Renown: its page, listings and sign-in stop working. You can restore it later from this report.`,
        confirm: `Take down ${orgName}`,
        onConfirm,
      }
    case 'RELEASE_HANDLE':
      return {
        title: `Release the handle of ${orgName}?`,
        body: `${orgName} is renamed to org-<id8> and its old handle is reserved for 30 days. Only an organisation with a verified domain equal to the handle can claim it.`,
        confirm: `Release the handle of ${orgName}`,
        onConfirm,
      }
    case 'RESTORE':
      return {
        title: `Restore ${orgName}?`,
        body: `${orgName} comes back everywhere on Renown, with its page, listings and sign-in working again.`,
        confirm: `Restore ${orgName}`,
        onConfirm,
      }
    default:
      return null
  }
}

function NotFound() {
  return <ErrorState code="404" title="This page is not on the network" message="The link may be old or mistyped. Profiles live at renown.id/@handle and apps at renown.id/app/<DID>." />
}

function ReportItem({ report, onResolve, busy }: { report: OrgReport; onResolve: (report: OrgReport, resolution: OrgReportResolution, note: string) => void; busy: boolean }) {
  const [note, setNote] = useState('')
  const { ask, dialog } = useConfirm()
  // A report on a deleted organisation can only be dismissed (D15); RESTORE
  // exists only on a report already resolved with TAKE_DOWN.
  const options: OrgReportResolution[] = report.status === 'OPEN' ? (report.org ? ['DISMISS', 'TAKE_DOWN', 'RELEASE_HANDLE'] : ['DISMISS']) : report.org && report.resolution === 'TAKE_DOWN' ? ['RESTORE'] : []

  function choose(resolution: OrgReportResolution) {
    const run = () => onResolve(report, resolution, note)
    const request = report.org ? confirmation(resolution, report.org.name, run) : null
    if (request) ask(request)
    else run()
  }

  return (
    <li className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {report.org ? (
            <Link href={orgPath(report.org.handle)} className="text-ink font-semibold break-words hover:underline">
              {report.org.name} <span className="text-ink-muted font-normal">@{report.org.handle}</span>
            </Link>
          ) : (
            <p className="text-ink text-sm">
              Deleted organisation <span className="font-mono break-all">{report.orgId}</span>
            </p>
          )}
          <p className="text-ink-muted text-xs">
            Reported by {shortAddress(report.reporter)} on {formatAbsolute(report.createdAt)}
          </p>
        </div>
        <Badge>{REASON_TEXT[report.reason]}</Badge>
      </div>
      {report.details && <p className="text-ink mt-3 text-sm leading-6 break-words whitespace-pre-line">{report.details}</p>}
      {report.status === 'RESOLVED' && (
        <p className="text-ink-muted mt-3 text-sm">
          {report.resolution ? RESOLUTION_LABEL[report.resolution] : 'Resolved'}
          {report.resolvedBy ? ` by ${shortAddress(report.resolvedBy)}` : ''}
          {report.note ? `: ${report.note}` : ''}
        </p>
      )}
      {options.length > 0 && (
        <div className="mt-4 space-y-3">
          <Field id={`note-${report.id}`} label="Note">
            <input id={`note-${report.id}`} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <button key={option} type="button" disabled={busy} onClick={() => choose(option)} className={buttonClasses(option === 'DISMISS' ? 'ghost' : 'secondary', 'md')}>
                {RESOLUTION_LABEL[option]}
              </button>
            ))}
          </div>
        </div>
      )}
      {dialog}
    </li>
  )
}

function Reports({ session }: { session: SignedIn }) {
  const { getBearer } = session
  const { toasts, show, dismiss } = useToasts()
  const [status, setStatus] = useState<OrgReportStatus>('OPEN')
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(async () => orgReports(status, await getBearer()), [status, getBearer])
  const reports = useRemote(`reports:${status}`, load)

  async function resolve(report: OrgReport, resolution: OrgReportResolution, note: string) {
    setBusy(report.id)
    const text = note.trim()
    const result = await orgWriter(sessionSigner(session)).write('resolveOrgReport', { reportId: report.id, resolution, ...(text && { note: text }) })
    setBusy(null)
    if (result.ok) {
      show('success', 'Resolved.')
      reports.reload()
    } else {
      show('error', result.message)
    }
  }

  if (reports.state.status === 'error' && reports.state.error.code === 'FORBIDDEN') return <NotFound />
  return (
    <Container className="min-h-[60vh] max-w-[860px] pt-12 pb-24 md:pt-16">
      <h1 className="text-ink text-h1">Reports</h1>
      <div className="mt-6 flex gap-2">
        {(['OPEN', 'RESOLVED'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className={cx('h-9 rounded-full border px-4 text-sm font-medium', status === value ? 'bg-primary-strong text-primary-foreground border-transparent' : 'border-hairline-strong bg-surface-1 text-ink')}
          >
            {value === 'OPEN' ? 'Open' : 'Resolved'}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {reports.state.status === 'loading' ? (
          <p role="status" className="text-ink-muted">
            Loading reports…
          </p>
        ) : reports.state.status === 'error' ? (
          <div role="alert">
            <p className="text-ink">The reports did not load.</p>
            <button type="button" onClick={reports.reload} className={buttonClasses('secondary', 'md', 'mt-3')}>
              Try again
            </button>
          </div>
        ) : reports.state.value.length === 0 ? (
          <p className="text-ink-muted">No {status === 'OPEN' ? 'open' : 'resolved'} reports.</p>
        ) : (
          <ul aria-label="Reports" className="border-hairline bg-surface-1 rounded-card divide-hairline divide-y border px-5">
            {reports.state.value.map((report) => (
              <ReportItem key={report.id} report={report} busy={busy === report.id} onResolve={(r, resolution, note) => void resolve(r, resolution, note)} />
            ))}
          </ul>
        )}
      </div>
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </Container>
  )
}

export function ReportsBody() {
  const session = useMeSession()
  if (session.state === 'loading') return <OrgBodyLoading error={null} />
  if (session.state === 'signed-out') return <NotFound />
  return <Reports key={session.address} session={session} />
}
