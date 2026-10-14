import { useEffect, useRef, useState } from 'react'
import { identityAccent } from '../../lib/identity-art'
import { signerHeading } from '../../lib/verify/parties'
import type { Report, Verdict } from '../../lib/verify/types'
import { cx } from '../../utils/cx'
import { CheckList } from './check-list'
import { AppCard, SignerCard, Times } from './party-cards'
import { TONE_TEXT, VERDICT_TONE, VerdictSeal, type Tone } from './verdict-seal'

const TITLE: Record<Exclude<Verdict, 'identity'>, string> = {
  genuine: 'Genuine',
  'not-genuine': 'Not genuine',
  revoked: 'Revoked',
  expired: 'Expired',
  'not-yet-valid': 'Not valid yet',
  'not-valid': 'Not valid',
  unchecked: 'Could not check',
  unrecorded: 'Signature valid, but this release is not recorded by Renown',
  'other-publisher': 'Signed for a publisher that does not publish this app now',
}

const BAND: Record<Tone, string> = {
  good: 'border-signal/30 bg-signal/[0.06]',
  bad: 'border-danger-ink/35 bg-danger-ink/[0.06]',
  caution: 'border-caution-ink/35 bg-caution-ink/[0.07]',
  neutral: 'border-hairline-strong bg-surface-1',
  info: 'border-primary/25 bg-primary/[0.05]',
}

export function verdictTitle(report: Report): string {
  if (report.verdict === 'identity') return report.kind === 'did-key' ? 'An app key' : 'A Renown identity'
  return TITLE[report.verdict]
}

function ShareButton({ url }: { url: string }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copied = copy === 'copied'
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopy('idle'), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <>
      <button
        type="button"
        onClick={() => {
          // writeText is missing outside secure contexts, and browsers may refuse it.
          Promise.resolve()
            .then(() => navigator.clipboard.writeText(url))
            .then(
              () => setCopy('copied'),
              () => setCopy('failed'),
            )
        }}
        className="border-hairline-strong bg-surface-1 text-ink hover:border-primary/50 inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors"
      >
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {copied ? (
            <path d="M20 6 9 17l-5-5" />
          ) : (
            <>
              <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
              <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
            </>
          )}
        </svg>
        {copied ? 'Link copied' : 'Copy share link'}
      </button>
      <span role="status" className="sr-only">
        {copied ? 'Share link copied' : ''}
      </span>
      {copy === 'failed' && (
        <div className="mt-3">
          <p role="alert" className="text-ink-muted text-xs leading-5">
            Could not copy the link. Select it below and copy it yourself.
          </p>
          <label htmlFor="verify-share-link" className="sr-only">
            Share link
          </label>
          <input
            id="verify-share-link"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            className="border-hairline-strong bg-surface-1 text-ink mt-1.5 h-9 w-full rounded-[8px] border px-2 font-mono text-xs"
          />
        </div>
      )}
    </>
  )
}

/** The result: verdict band, the checks made, and who and what they are about. Focus moves to the verdict. */
export function VerifyReport({ report, shareUrl }: { report: Report; shareUrl: string | null }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [report])
  const tone = VERDICT_TONE[report.verdict]
  const accent = report.signer ? identityAccent(report.signer.address) : null
  const hasSide = !!(report.signer || report.app || report.times.length)
  return (
    <section aria-labelledby="verify-verdict" data-kind={report.kind} className="mt-10 md:mt-14">
      <div className={cx('rounded-panel flex flex-col gap-5 border p-6 sm:flex-row sm:items-center md:gap-7 md:p-8', BAND[tone])}>
        <VerdictSeal verdict={report.verdict} accent={accent} />
        <div className="min-w-0 flex-1">
          <h2 id="verify-verdict" ref={headingRef} tabIndex={-1} className={cx('text-h2 outline-none', TONE_TEXT[tone])}>
            {verdictTitle(report)}
          </h2>
          <p className="text-ink mt-2 max-w-[60ch] text-[17px] leading-7 text-pretty">{report.summary}</p>
        </div>
        <div className="shrink-0 sm:w-[220px]">
          {shareUrl ? <ShareButton url={shareUrl} /> : <p className="text-ink-muted text-sm leading-6">This paste is too long to share as a link.</p>}
        </div>
      </div>

      <div className={cx('mt-10 grid gap-10', hasSide && 'lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14')}>
        <div className="min-w-0">
          <h2 className="text-ink text-h3">What was checked</h2>
          <div className="mt-4">
            <CheckList checks={report.checks} />
          </div>
        </div>
        {hasSide && (
          <aside className="min-w-0 space-y-4" aria-label="Details">
            {report.signer && <SignerCard signer={report.signer} heading={signerHeading(report)} />}
            {report.app && <AppCard app={report.app} />}
            <Times times={report.times} />
          </aside>
        )}
      </div>
    </section>
  )
}
