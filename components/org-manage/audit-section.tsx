import { useCallback, useEffect, useState } from 'react'
import { auditActionText, auditDetailsText, auditFileName } from '../../lib/orgs/audit'
import { shortAddress } from '../../lib/orgs/format'
import { toOrgApiError, withBearer } from '../../services/orgs'
import { orgAuditExport, orgAuditLog, type OrgAuditEntry } from '../../services/org-security'
import { formatAbsolute } from '../../utils/relative-time'
import { buttonClasses } from '../site/primitives'
import type { ManageSectionProps } from './manage-context'
import { Panel } from './manage-ui'

interface Log {
  items: OrgAuditEntry[]
  next: string | null
  status: 'loading' | 'ready' | 'error'
  more: 'idle' | 'loading' | 'error'
}

export function AuditSection({ ctx }: ManageSectionProps) {
  const { org, getBearer } = ctx
  const [log, setLog] = useState<Log>({ items: [], next: null, status: 'loading', more: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let cancelled = false
    withBearer(getBearer, (bearer) => orgAuditLog(org.id, null, bearer)).then(
      (page) => {
        if (!cancelled)
          setLog({ items: page.items, next: page.next, status: 'ready', more: 'idle' })
      },
      () => {
        if (!cancelled) setLog((l) => ({ ...l, status: 'error' }))
      },
    )
    return () => {
      cancelled = true
    }
  }, [org.id, getBearer, attempt])

  const loadMore = useCallback(async () => {
    if (!log.next) return
    const after = log.next
    setLog((l) => ({ ...l, more: 'loading' }))
    try {
      const page = await withBearer(getBearer, (bearer) => orgAuditLog(org.id, after, bearer))
      setLog((l) => ({
        ...l,
        items: [...l.items, ...page.items.filter((e) => !l.items.some((o) => o.id === e.id))],
        next: page.next,
        more: 'idle',
      }))
    } catch {
      setLog((l) => ({ ...l, more: 'error' }))
    }
  }, [log.next, org.id, getBearer])

  async function exportJson() {
    setExporting(true)
    try {
      const json = await withBearer(getBearer, (bearer) => orgAuditExport(org.id, bearer))
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = auditFileName(org.handle, new Date())
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      // D22: 10 exports an hour per admin.
      ctx.notify(
        'error',
        toOrgApiError(error).code === 'RATE_LIMITED'
          ? 'You can export the audit log 10 times an hour. Try again later.'
          : 'The export did not download. Try again.',
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mt-6">
      <Panel
        id="audit-title"
        title="Audit log"
        description="Every change to the organisation, by whom and when. Only admins and owners see it. You can export 10 times an hour."
        actions={
          <button
            type="button"
            disabled={exporting}
            onClick={() => void exportJson()}
            className={buttonClasses('secondary', 'md')}
          >
            {exporting ? 'Exporting…' : 'Export JSON'}
          </button>
        }
      >
        {log.status === 'loading' && (
          <p role="status" className="text-ink-muted text-sm">
            Loading the audit log…
          </p>
        )}
        {log.status === 'error' && (
          <div role="alert" className="text-sm">
            <p className="text-ink">The audit log did not load.</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className={buttonClasses('secondary', 'md', 'mt-3')}
            >
              Try again
            </button>
          </div>
        )}
        {log.status === 'ready' &&
          (log.items.length === 0 ? (
            <p className="text-ink-muted text-sm">Nothing logged yet.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto px-5 md:-mx-6 md:px-6">
              <table aria-label="Audit log" className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-ink-muted text-xs">
                  <tr>
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 pr-4 font-medium">Who</th>
                    <th className="py-2 pr-4 font-medium">What</th>
                    <th className="py-2 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-hairline divide-y">
                  {log.items.map((entry) => (
                    <tr key={entry.id} className="align-top">
                      <td className="text-ink-muted py-2 pr-4 whitespace-nowrap">
                        <time dateTime={entry.at}>{formatAbsolute(entry.at)}</time>
                      </td>
                      <td className="text-ink py-2 pr-4 font-mono text-xs whitespace-nowrap">
                        {entry.actor === 'system' ? 'Renown' : shortAddress(entry.actor)}
                      </td>
                      <td className="text-ink py-2 pr-4">{auditActionText(entry.action)}</td>
                      <td className="text-ink-muted py-2 break-words">
                        {auditDetailsText(entry.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        {log.next && (
          <div className="mt-4">
            <button
              type="button"
              aria-disabled={log.more === 'loading'}
              onClick={() => void loadMore()}
              className={buttonClasses('secondary', 'md')}
            >
              {log.more === 'loading' ? 'Loading…' : 'Load more'}
            </button>
            {log.more === 'error' && (
              <p role="alert" className="text-ink-muted mt-2 text-sm">
                More entries didn&apos;t load. Select the button to try again.
              </p>
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}
